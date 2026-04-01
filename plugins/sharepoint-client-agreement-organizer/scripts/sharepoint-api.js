/**
 * SharePoint API wrapper — Microsoft Graph API calls.
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

  const result = await api.getSharePointCredentials();
  cachedToken = result.credentials.access_token;
  // Assume 60 min TTL from when we fetched it
  tokenExpiresAt = Date.now() + 55 * 60 * 1000;
  return cachedToken;
}

async function graphRequest(method, path, body) {
  const token = await getAccessToken();
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, opts);

  if (response.status === 401) {
    // Token expired — force refresh and retry once
    try {
      await api.refreshSharePointToken();
      cachedToken = null;
      const newToken = await getAccessToken();
      opts.headers['Authorization'] = `Bearer ${newToken}`;
      const retry = await fetch(`https://graph.microsoft.com/v1.0${path}`, opts);
      if (!retry.ok) {
        const errBody = await retry.text();
        throw new Error(`Graph API ${retry.status}: ${errBody}`);
      }
      return retry.json();
    } catch (err) {
      throw new Error(`SharePoint auth failed after refresh: ${err.message}`);
    }
  }

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Graph API ${response.status}: ${errBody}`);
  }

  return response.json();
}

// ── Graph API methods ───────────────────────────────────────

async function getCurrentUser() {
  return graphRequest('GET', '/me');
}

async function listSites() {
  return graphRequest('GET', '/sites?search=*&$top=100');
}

async function listDrives(siteId) {
  return graphRequest('GET', `/sites/${siteId}/drives`);
}

async function listFolder(driveId, itemId) {
  const folderId = itemId || 'root';
  return graphRequest('GET', `/drives/${driveId}/items/${folderId}/children?$top=200&$select=id,name,folder,file,size,lastModifiedDateTime`);
}

async function getFolderInfo(driveId, itemId) {
  const folderId = itemId || 'root';
  return graphRequest('GET', `/drives/${driveId}/items/${folderId}?$select=id,name,folder,file,size,lastModifiedDateTime,parentReference`);
}

async function copyFile(driveId, itemId, destFolderId, newName) {
  return graphRequest('POST', `/drives/${driveId}/items/${itemId}/copy`, {
    parentReference: { driveId, id: destFolderId },
    name: newName
  });
}

async function createFolder(driveId, parentId, name) {
  return graphRequest('POST', `/drives/${driveId}/items/${parentId}/children`, {
    name,
    folder: {},
    '@microsoft.graph.conflictBehavior': 'rename'
  });
}

/**
 * Recursively list all items in a folder tree.
 * Returns flat array of { id, name, type, size, lastModifiedDateTime, path }
 */
async function listFolderRecursive(driveId, itemId, currentPath = '') {
  const items = [];
  const result = await listFolder(driveId, itemId);

  for (const entry of (result.value || [])) {
    const itemPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

    if (entry.file) {
      items.push({
        id: entry.id,
        name: entry.name,
        type: 'file',
        size: entry.size || 0,
        lastModifiedDateTime: entry.lastModifiedDateTime,
        path: itemPath,
        parentItemId: itemId
      });
    } else if (entry.folder) {
      items.push({
        id: entry.id,
        name: entry.name,
        type: 'folder',
        path: itemPath,
        parentItemId: itemId
      });

      // Recurse into subfolder
      const subItems = await listFolderRecursive(driveId, entry.id, itemPath);
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
async function scanAgreements(driveId, folderId) {
  const topLevel = await listFolder(driveId, folderId);
  const households = [];

  for (const entry of (topLevel.value || [])) {
    if (!entry.folder) continue;

    console.error(`  Scanning: ${entry.name}...`);
    const files = await listFolderRecursive(driveId, entry.id, entry.name);
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
  listSites,
  listDrives,
  listFolder,
  getFolderInfo,
  copyFile,
  createFolder,
  listFolderRecursive,
  scanAgreements,
  AGREEMENT_PATTERNS
};
