/**
 * Vault API wrapper -- supports Box, SharePoint, and Egnyte.
 * Each platform has its own scanAgreements() method that returns
 * a normalized array of { name, agreements, agreementCount, totalFiles }.
 *
 * Usage:
 *   const vault = require('./vault-api');
 *   vault.setPlatform('box'); // or 'sharepoint' or 'egnyte'
 *   const households = await vault.scanAgreements(folderId);
 */

const fetch = require('node-fetch');
const api = require('./lea-skills-api');

let currentPlatform = null;

function setPlatform(platform) {
  const valid = ['box', 'sharepoint', 'egnyte'];
  if (!valid.includes(platform)) {
    throw new Error(`Invalid platform: ${platform}. Must be one of: ${valid.join(', ')}`);
  }
  currentPlatform = platform;
}

function getPlatform() {
  if (!currentPlatform) throw new Error('No vault platform set. Call setPlatform() first.');
  return currentPlatform;
}

// ── Shared agreement patterns ───────────────────────────────

const AGREEMENT_PATTERNS = [
  /client\s*engagement\s*agreement/i,
  /\bcea\b/i,
  /investment\s*management\s*agreement/i,
  /\bima\b/i,
  /investment\s*policy\s*statement/i,
  /\bips\b/i,
  /client\s*agreement/i,
];

function matchAgreements(filename) {
  const nameNoExt = filename.replace(/\.[^.]+$/, '');
  return AGREEMENT_PATTERNS.filter(p => p.test(nameNoExt));
}

function classifyAgreement(matchedPatterns) {
  for (const src of matchedPatterns) {
    if (/cea/i.test(src) || /client\s*engagement/i.test(src)) return 'CEA';
    if (/ima/i.test(src) || /investment\s*management/i.test(src)) return 'IMA';
    if (/ips/i.test(src) || /investment\s*policy/i.test(src)) return 'IPS';
  }
  return 'CA';
}

// ══════════════════════════════════════════════════════════════
// BOX
// ══════════════════════════════════════════════════════════════

let boxToken = null;
let boxTokenExpires = 0;

async function boxGetToken() {
  if (boxToken && Date.now() < boxTokenExpires - 60000) return boxToken;
  const result = await api.getBoxCredentials();
  boxToken = result.credentials.access_token;
  const boxTtl = result.credentials.expires_in
    ? result.credentials.expires_in * 1000
    : 55 * 60 * 1000;
  boxTokenExpires = Date.now() + boxTtl;
  return boxToken;
}

async function boxRequest(method, path, body) {
  const token = await boxGetToken();
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);

  const response = await fetch(`https://api.box.com/2.0${path}`, opts);

  if (response.status === 401) {
    await api.refreshBoxToken();
    boxToken = null;
    const newToken = await boxGetToken();
    opts.headers['Authorization'] = `Bearer ${newToken}`;
    const retry = await fetch(`https://api.box.com/2.0${path}`, opts);
    if (!retry.ok) {
      const errBody = await retry.text();
      console.error(`Vault API error ${retry.status}:`, errBody);
      throw new Error(`Vault API request failed (${retry.status}). Check connection and retry.`);
    }
    return retry.json();
  }

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`Vault API error ${response.status}:`, errBody);
    throw new Error(`Vault API request failed (${response.status}). Check connection and retry.`);
  }
  return response.json();
}

async function boxListFolder(folderId) {
  return boxRequest('GET', `/folders/${folderId}/items?fields=id,name,type,size,modified_at&limit=1000`);
}

async function boxListFolderRecursive(folderId, currentPath = '') {
  const items = [];
  const result = await boxListFolder(folderId);
  for (const entry of result.entries) {
    const itemPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    if (entry.type === 'file') {
      items.push({ id: entry.id, name: entry.name, type: 'file', size: entry.size || 0, path: itemPath });
    } else if (entry.type === 'folder') {
      items.push({ id: entry.id, name: entry.name, type: 'folder', path: itemPath });
      const subItems = await boxListFolderRecursive(entry.id, itemPath);
      items.push(...subItems);
    }
  }
  return items;
}

async function boxGetCurrentUser() {
  return boxRequest('GET', '/users/me');
}

async function boxScanAgreements(folderId) {
  const topLevel = await boxListFolder(folderId);
  const households = [];
  for (const entry of topLevel.entries) {
    if (entry.type !== 'folder') continue;
    console.error(`  Scanning: ${entry.name}...`);
    const files = await boxListFolderRecursive(entry.id, entry.name);
    const fileItems = files.filter(f => f.type === 'file');
    const agreements = [];
    for (const file of fileItems) {
      const matches = matchAgreements(file.name);
      if (matches.length > 0) {
        agreements.push({ ...file, matchedPatterns: matches.map(p => p.source), type: classifyAgreement(matches.map(p => p.source)) });
      }
    }
    households.push({ name: entry.name, id: entry.id, totalFiles: fileItems.length, agreements, agreementCount: agreements.length });
  }
  return households;
}

// ══════════════════════════════════════════════════════════════
// SHAREPOINT
// ══════════════════════════════════════════════════════════════

let spToken = null;
let spTokenExpires = 0;

async function spGetToken() {
  if (spToken && Date.now() < spTokenExpires - 60000) return spToken;
  const result = await api.getSharePointCredentials();
  spToken = result.credentials.access_token;
  const spTtl = result.credentials.expires_in
    ? result.credentials.expires_in * 1000
    : 55 * 60 * 1000;
  spTokenExpires = Date.now() + spTtl;
  return spToken;
}

async function spRequest(method, path, body) {
  const token = await spGetToken();
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);

  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, opts);

  if (response.status === 401) {
    await api.refreshSharePointToken();
    spToken = null;
    const newToken = await spGetToken();
    opts.headers['Authorization'] = `Bearer ${newToken}`;
    const retry = await fetch(`https://graph.microsoft.com/v1.0${path}`, opts);
    if (!retry.ok) {
      const errBody = await retry.text();
      console.error(`Vault API error ${retry.status}:`, errBody);
      throw new Error(`Vault API request failed (${retry.status}). Check connection and retry.`);
    }
    return retry.json();
  }

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`Vault API error ${response.status}:`, errBody);
    throw new Error(`Vault API request failed (${response.status}). Check connection and retry.`);
  }
  return response.json();
}

async function spGetCurrentUser() {
  return spRequest('GET', '/me');
}

async function spListSites() {
  return spRequest('GET', '/sites?search=*&$top=100');
}

async function spListDrives(siteId) {
  return spRequest('GET', `/sites/${siteId}/drives`);
}

async function spListFolder(driveId, itemId) {
  const folderId = itemId || 'root';
  return spRequest('GET', `/drives/${driveId}/items/${folderId}/children?$top=200&$select=id,name,folder,file,size,lastModifiedDateTime`);
}

async function spListFolderRecursive(driveId, itemId, currentPath = '') {
  const items = [];
  const result = await spListFolder(driveId, itemId);
  for (const entry of (result.value || [])) {
    const itemPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    if (entry.file) {
      items.push({ id: entry.id, name: entry.name, type: 'file', size: entry.size || 0, path: itemPath });
    } else if (entry.folder) {
      items.push({ id: entry.id, name: entry.name, type: 'folder', path: itemPath });
      const subItems = await spListFolderRecursive(driveId, entry.id, itemPath);
      items.push(...subItems);
    }
  }
  return items;
}

async function spScanAgreements(driveId, folderId) {
  const topLevel = await spListFolder(driveId, folderId);
  const households = [];
  for (const entry of (topLevel.value || [])) {
    if (!entry.folder) continue;
    console.error(`  Scanning: ${entry.name}...`);
    const files = await spListFolderRecursive(driveId, entry.id, entry.name);
    const fileItems = files.filter(f => f.type === 'file');
    const agreements = [];
    for (const file of fileItems) {
      const matches = matchAgreements(file.name);
      if (matches.length > 0) {
        agreements.push({ ...file, matchedPatterns: matches.map(p => p.source), type: classifyAgreement(matches.map(p => p.source)) });
      }
    }
    households.push({ name: entry.name, id: entry.id, totalFiles: fileItems.length, agreements, agreementCount: agreements.length });
  }
  return households;
}

// ══════════════════════════════════════════════════════════════
// EGNYTE
// ══════════════════════════════════════════════════════════════

let egToken = null;
let egDomain = null;
let egTokenExpires = 0;

async function egGetAuth() {
  if (egToken && egDomain && Date.now() < egTokenExpires - 60000) return { token: egToken, domain: egDomain };
  const result = await api.getEgnyteCredentials();
  egToken = result.credentials.access_token;
  egDomain = result.credentials.egnyte_domain;
  const egTtl = result.credentials.expires_in
    ? result.credentials.expires_in * 1000
    : 55 * 60 * 1000;
  egTokenExpires = Date.now() + egTtl;
  return { token: egToken, domain: egDomain };
}

async function egRequest(method, path, body) {
  const { token, domain } = await egGetAuth();
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);

  const url = `https://${domain}.egnyte.com/pubapi/v1${path}`;
  const response = await fetch(url, opts);

  if (response.status === 401) {
    await api.refreshEgnyteToken();
    egToken = null;
    egDomain = null;
    const auth = await egGetAuth();
    opts.headers['Authorization'] = `Bearer ${auth.token}`;
    const retryUrl = `https://${auth.domain}.egnyte.com/pubapi/v1${path}`;
    const retry = await fetch(retryUrl, opts);
    if (!retry.ok) {
      const errBody = await retry.text();
      console.error(`Vault API error ${retry.status}:`, errBody);
      throw new Error(`Vault API request failed (${retry.status}). Check connection and retry.`);
    }
    return retry.json();
  }

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`Vault API error ${response.status}:`, errBody);
    throw new Error(`Vault API request failed (${response.status}). Check connection and retry.`);
  }
  return response.json();
}

async function egGetCurrentUser() {
  return egRequest('GET', '/userinfo');
}

async function egListFolder(folderPath) {
  const allFiles = [];
  const allFolders = [];
  let offset = 0;
  const count = 100;

  while (true) {
    const result = await egRequest('GET', `/fs${folderPath}?list_content=true&offset=${offset}&count=${count}`);
    if (result.files) allFiles.push(...result.files);
    if (result.folders) allFolders.push(...result.folders);
    const totalItems = (result.files || []).length + (result.folders || []).length;
    if (totalItems < count) break;
    offset += count;
  }

  return { name: folderPath.split('/').pop() || folderPath, path: folderPath, folders: allFolders, files: allFiles };
}

async function egListFolderRecursive(folderPath, currentRelPath = '') {
  const items = [];
  const result = await egListFolder(folderPath);

  for (const file of (result.files || [])) {
    const relPath = currentRelPath ? `${currentRelPath}/${file.name}` : file.name;
    items.push({ name: file.name, type: 'file', size: file.size || 0, path: `${folderPath}/${file.name}`, relativePath: relPath });
  }

  for (const folder of (result.folders || [])) {
    const relPath = currentRelPath ? `${currentRelPath}/${folder.name}` : folder.name;
    items.push({ name: folder.name, type: 'folder', path: folder.path || `${folderPath}/${folder.name}`, relativePath: relPath });
    const subPath = folder.path || `${folderPath}/${folder.name}`;
    const subItems = await egListFolderRecursive(subPath, relPath);
    items.push(...subItems);
  }

  return items;
}

async function egScanAgreements(folderPath) {
  const topLevel = await egListFolder(folderPath);
  const households = [];

  for (const folder of (topLevel.folders || [])) {
    const subPath = folder.path || `${folderPath}/${folder.name}`;
    console.error(`  Scanning: ${folder.name}...`);
    const files = await egListFolderRecursive(subPath, folder.name);
    const fileItems = files.filter(f => f.type === 'file');
    const agreements = [];
    for (const file of fileItems) {
      const matches = matchAgreements(file.name);
      if (matches.length > 0) {
        agreements.push({ ...file, matchedPatterns: matches.map(p => p.source), type: classifyAgreement(matches.map(p => p.source)) });
      }
    }
    households.push({ name: folder.name, path: subPath, totalFiles: fileItems.length, agreements, agreementCount: agreements.length });
  }

  return households;
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API -- platform-agnostic
// ══════════════════════════════════════════════════════════════

/**
 * Scan agreements using whichever platform is set.
 * Box/SharePoint: pass folderId (and driveId for SharePoint)
 * Egnyte: pass folderPath
 */
async function scanAgreements(folderRef, driveId) {
  const p = getPlatform();
  if (p === 'box') return boxScanAgreements(folderRef);
  if (p === 'sharepoint') return spScanAgreements(driveId, folderRef);
  if (p === 'egnyte') return egScanAgreements(folderRef);
}

async function listFolder(folderRef, driveId) {
  const p = getPlatform();
  if (p === 'box') return boxListFolder(folderRef);
  if (p === 'sharepoint') return spListFolder(driveId, folderRef);
  if (p === 'egnyte') return egListFolder(folderRef);
}

async function verifyVaultConnection() {
  const p = getPlatform();
  if (p === 'box') return boxGetCurrentUser();
  if (p === 'sharepoint') return spGetCurrentUser();
  if (p === 'egnyte') return egGetCurrentUser();
}

module.exports = {
  setPlatform,
  getPlatform,
  scanAgreements,
  listFolder,
  verifyVaultConnection,
  classifyAgreement,
  AGREEMENT_PATTERNS,
  // Platform-specific exports for folder browsing
  spListSites,
  spListDrives,
  spListFolder,
  boxListFolder,
  egListFolder
};
