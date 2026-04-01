/**
 * Egnyte API wrapper — Egnyte REST API calls.
 * Gets access token + domain from LEA Skills API on demand.
 *
 * Key differences from Box/SharePoint:
 *   - Per-customer domains: all URLs go to https://{domain}.egnyte.com
 *   - Path-based: no folder IDs, everything uses file paths like /Shared/Clients/Anderson
 *   - Pagination uses offset/count (max 100 per page)
 */

const fetch = require('node-fetch');
const api = require('./lea-skills-api');

let cachedToken = null;
let cachedDomain = null;
let tokenExpiresAt = 0;

async function getAuth() {
  // Use cached token if still valid (with 1 min buffer)
  if (cachedToken && cachedDomain && Date.now() < tokenExpiresAt - 60 * 1000) {
    return { token: cachedToken, domain: cachedDomain };
  }

  const result = await api.getEgnyteCredentials();
  cachedToken = result.credentials.access_token;
  cachedDomain = result.credentials.egnyte_domain;
  // Assume 60 min TTL from when we fetched it
  tokenExpiresAt = Date.now() + 55 * 60 * 1000;
  return { token: cachedToken, domain: cachedDomain };
}

async function egnyteRequest(method, path, body) {
  const { token, domain } = await getAuth();
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const url = `https://${domain}.egnyte.com/pubapi/v1${path}`;
  const response = await fetch(url, opts);

  if (response.status === 401) {
    // Token expired — force refresh and retry once
    try {
      await api.refreshEgnyteToken();
      cachedToken = null;
      cachedDomain = null;
      const auth = await getAuth();
      opts.headers['Authorization'] = `Bearer ${auth.token}`;
      const retryUrl = `https://${auth.domain}.egnyte.com/pubapi/v1${path}`;
      const retry = await fetch(retryUrl, opts);
      if (!retry.ok) {
        const errBody = await retry.text();
        throw new Error(`Egnyte API ${retry.status}: ${errBody}`);
      }
      return retry.json();
    } catch (err) {
      throw new Error(`Egnyte auth failed after refresh: ${err.message}`);
    }
  }

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Egnyte API ${response.status}: ${errBody}`);
  }

  return response.json();
}

// ── Egnyte API methods ──────────────────────────────────────

async function getCurrentUser() {
  return egnyteRequest('GET', '/userinfo');
}

/**
 * List contents of a folder by path.
 * Egnyte paginates with offset/count (max 100 per page).
 * Returns all entries (auto-paginates).
 */
async function listFolder(folderPath) {
  const allFiles = [];
  const allFolders = [];
  let offset = 0;
  const count = 100;

  while (true) {
    const result = await egnyteRequest('GET', `/fs${folderPath}?list_content=true&offset=${offset}&count=${count}`);

    if (result.files) allFiles.push(...result.files);
    if (result.folders) allFolders.push(...result.folders);

    // Check if there are more pages
    const totalItems = (result.files || []).length + (result.folders || []).length;
    if (totalItems < count) break;
    offset += count;
  }

  return {
    name: folderPath.split('/').pop() || folderPath,
    path: folderPath,
    folders: allFolders,
    files: allFiles
  };
}

async function getFolderInfo(folderPath) {
  return egnyteRequest('GET', `/fs${folderPath}`);
}

/**
 * Copy a file from srcPath to destPath.
 * Egnyte copy: POST /pubapi/v1/fs/{srcPath} with {"action":"copy","destination":destPath}
 */
async function copyFile(srcPath, destPath) {
  return egnyteRequest('POST', `/fs${srcPath}`, {
    action: 'copy',
    destination: destPath
  });
}

/**
 * Create a folder at the given path.
 * Egnyte: POST /pubapi/v1/fs/{path} with {"action":"add_folder"}
 */
async function createFolder(folderPath) {
  return egnyteRequest('POST', `/fs${folderPath}`, {
    action: 'add_folder'
  });
}

/**
 * Recursively list all items in a folder tree.
 * Returns flat array of { name, type, size, lastModified, path }
 */
async function listFolderRecursive(folderPath, currentRelPath = '') {
  const items = [];
  const result = await listFolder(folderPath);

  for (const file of (result.files || [])) {
    const relPath = currentRelPath ? `${currentRelPath}/${file.name}` : file.name;
    items.push({
      name: file.name,
      type: 'file',
      size: file.size || 0,
      lastModified: file.last_modified,
      path: `${folderPath}/${file.name}`,
      relativePath: relPath
    });
  }

  for (const folder of (result.folders || [])) {
    const relPath = currentRelPath ? `${currentRelPath}/${folder.name}` : folder.name;
    items.push({
      name: folder.name,
      type: 'folder',
      path: folder.path || `${folderPath}/${folder.name}`,
      relativePath: relPath
    });

    // Recurse into subfolder
    const subPath = folder.path || `${folderPath}/${folder.name}`;
    const subItems = await listFolderRecursive(subPath, relPath);
    items.push(...subItems);
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
async function scanAgreements(folderPath) {
  const topLevel = await listFolder(folderPath);
  const households = [];

  for (const folder of (topLevel.folders || [])) {
    const subPath = folder.path || `${folderPath}/${folder.name}`;
    console.error(`  Scanning: ${folder.name}...`);
    const files = await listFolderRecursive(subPath, folder.name);
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
      name: folder.name,
      path: subPath,
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
  copyFile,
  createFolder,
  listFolderRecursive,
  scanAgreements,
  AGREEMENT_PATTERNS
};
