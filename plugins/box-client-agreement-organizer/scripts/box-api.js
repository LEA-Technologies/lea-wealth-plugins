/**
 * Box API wrapper — raw HTTPS calls, no SDK.
 * Gets access token from LEA Skills API on demand.
 */

const fetch = require('node-fetch');
const api = require('./lea-skills-api');

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  // Use cached token if still valid (with 1 min buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60 * 1000) {
    return cachedToken;
  }

  const result = await api.getBoxCredentials();
  cachedToken = result.credentials.access_token;
  // Assume 60 min TTL from when we fetched it
  tokenExpiresAt = Date.now() + 55 * 60 * 1000;
  return cachedToken;
}

async function boxRequest(method, path, body) {
  const token = await getAccessToken();
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const response = await fetch(`https://api.box.com/2.0${path}`, opts);

  if (response.status === 401) {
    // Token expired — force refresh and retry once
    try {
      await api.refreshBoxToken();
      cachedToken = null;
      const newToken = await getAccessToken();
      opts.headers['Authorization'] = `Bearer ${newToken}`;
      const retry = await fetch(`https://api.box.com/2.0${path}`, opts);
      if (!retry.ok) {
        const errBody = await retry.text();
        throw new Error(`Box API ${retry.status}: ${errBody}`);
      }
      return retry.json();
    } catch (err) {
      throw new Error(`Box auth failed after refresh: ${err.message}`);
    }
  }

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Box API ${response.status}: ${errBody}`);
  }

  return response.json();
}

// ── Box API methods ─────────────────────────────────────────

async function getCurrentUser() {
  return boxRequest('GET', '/users/me');
}

async function listFolder(folderId, offset = 0, limit = 1000) {
  return boxRequest('GET', `/folders/${folderId}/items?fields=id,name,type,size,modified_at&offset=${offset}&limit=${limit}`);
}

async function getFolderInfo(folderId) {
  return boxRequest('GET', `/folders/${folderId}?fields=id,name,type,path_collection`);
}

async function getFileInfo(fileId) {
  return boxRequest('GET', `/files/${fileId}?fields=id,name,type,size,modified_at,parent`);
}

async function copyFile(fileId, parentFolderId, newName) {
  return boxRequest('POST', `/files/${fileId}/copy`, {
    parent: { id: parentFolderId },
    name: newName
  });
}

async function createFolder(parentFolderId, name) {
  return boxRequest('POST', '/folders', {
    name,
    parent: { id: parentFolderId }
  });
}

/**
 * Recursively list all items in a folder tree.
 * Returns flat array of { id, name, type, size, modified_at, path }
 */
async function listFolderRecursive(folderId, currentPath = '') {
  const items = [];
  const result = await listFolder(folderId);

  for (const entry of result.entries) {
    const itemPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

    if (entry.type === 'file') {
      items.push({
        id: entry.id,
        name: entry.name,
        type: entry.type,
        size: entry.size || 0,
        modified_at: entry.modified_at,
        path: itemPath,
        parentFolderId: folderId
      });
    } else if (entry.type === 'folder') {
      items.push({
        id: entry.id,
        name: entry.name,
        type: 'folder',
        path: itemPath,
        parentFolderId: folderId
      });

      // Recurse into subfolder
      const subItems = await listFolderRecursive(entry.id, itemPath);
      items.push(...subItems);
    }
  }

  return items;
}

// ── Agreement Patterns ──────────────────────────────────────

const AGREEMENT_PATTERNS = [
  /client\s*engagement\s*agreement/i,
  /\bcea\b/i,
  /investment\s*management\s*agreement/i,
  /\bima\b/i,
  /investment\s*policy\s*statement/i,
  /\bips\b/i,
  /client\s*agreement/i,
];

/**
 * Scan folder for client agreements by filename pattern.
 */
async function scanAgreements(folderId) {
  const topLevel = await listFolder(folderId);
  const households = [];

  for (const entry of topLevel.entries) {
    if (entry.type !== 'folder') continue;

    console.error(`  Scanning: ${entry.name}...`);
    const files = await listFolderRecursive(entry.id, entry.name);
    const fileItems = files.filter(f => f.type === 'file');

    const agreements = [];
    for (const file of fileItems) {
      const nameNoExt = file.name.replace(/\.[^.]+$/, '');
      const matches = AGREEMENT_PATTERNS.filter(p => p.test(nameNoExt));
      if (matches.length > 0) {
        agreements.push({
          ...file,
          matchedPatterns: matches.map(p => p.source)
        });
      }
    }

    households.push({
      id: entry.id,
      name: entry.name,
      totalFiles: fileItems.length,
      agreements,
      agreementCount: agreements.length
    });
  }

  return households;
}

module.exports = {
  getCurrentUser,
  listFolder,
  getFolderInfo,
  getFileInfo,
  copyFile,
  createFolder,
  listFolderRecursive,
  scanAgreements,
  AGREEMENT_PATTERNS
};
