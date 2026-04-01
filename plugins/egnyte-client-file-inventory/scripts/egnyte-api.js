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

// ── Document Tag Categories ─────────────────────────────────

const DOCUMENT_TAGS = {
  'Trust & Estate': [
    /\btrust\b/i, /\bestate\b/i, /\bwill\b/i, /\bpower\s*of\s*attorney\b/i,
    /\bpoa\b/i, /\bbeneficiary\b/i, /\btestament/i, /\bprobate\b/i,
    /\bguardian/i, /\btrustee\b/i, /\birrevocable\b/i, /\brevocable\b/i,
    /\bliving\s*trust/i, /\bfamily\s*trust/i
  ],
  'Statements': [
    /\bstatement/i, /\baccount\s*summary/i, /\bportfolio\s*report/i,
    /\bperformance\s*report/i, /\bquarterly\s*report/i, /\bmonthly\s*report/i,
    /\bannual\s*report/i, /\bbalance/i, /\bholdings/i, /\bconfirmation/i
  ],
  'Tax Documents': [
    /\btax\b/i, /\b1099/i, /\b1098/i, /\bw[\-\s]?2\b/i, /\bw[\-\s]?9\b/i,
    /\bk[\-\s]?1\b/i, /\b5498/i, /\b8949/i, /\bschedule\s*[a-z]/i,
    /\btax\s*return/i, /\birs\b/i
  ],
  'Insurance': [
    /\binsurance/i, /\bpolicy\b/i, /\bannuity/i, /\blife\s*insurance/i,
    /\bltc\b/i, /\blong[\-\s]*term\s*care/i, /\bdisability/i,
    /\bumbrella/i, /\bcoverage/i, /\bbenefits\b/i
  ],
  'Agreements': [
    /\bagreement/i, /\bcea\b/i, /\bima\b/i, /\bcontract/i,
    /\bfee\s*schedule/i, /\badvisory/i, /\bengagement/i,
    /\binvestment\s*management/i, /\bsigned/i, /\bexecuted/i,
    /\bamendment/i, /\baddendum/i
  ],
  'Real Estate': [
    /\breal\s*estate/i, /\bproperty/i, /\bmortgage/i, /\bdeed\b/i,
    /\btitle\b/i, /\bappraisal/i, /\blease\b/i, /\brental/i,
    /\bhomeowner/i, /\bclosing/i
  ],
  'Identity & Personal': [
    /\bpassport/i, /\bdriver/i, /\blicense\b/i, /\bsocial\s*security/i,
    /\bssn\b/i, /\bbirth\s*certificate/i, /\bidentification/i,
    /\bcitizenship/i, /\bmarriage/i, /\bdivorce/i, /\bid\s*card/i,
    /\bnew\s*account/i, /\baccount\s*app/i, /\bapplication\b/i,
    /\bkyc\b/i, /\bknow\s*your\s*c/i
  ],
  'Financial Planning': [
    /\bfinancial\s*plan/i, /\bretirement/i, /\bprojection/i,
    /\bgoal/i, /\bbudget/i, /\bcash\s*flow/i, /\bnet\s*worth/i,
    /\beducation\s*fund/i, /\b529\b/i, /\bsocial\s*security/i,
    /\brmd\b/i, /\brequired\s*minimum/i, /\bincome\s*plan/i
  ],
  'Correspondence': [
    /\bletter/i, /\bemail/i, /\bmemo\b/i, /\bnote\b/i,
    /\bcorrespondence/i, /\bcommunication/i, /\bmeeting\s*note/i,
    /\bminutes\b/i, /\breview\s*note/i
  ]
};

function tagDocument(filename) {
  const nameNoExt = filename.replace(/\.[^.]+$/, '');
  const tags = [];

  for (const [tag, patterns] of Object.entries(DOCUMENT_TAGS)) {
    for (const pattern of patterns) {
      if (pattern.test(nameNoExt)) {
        tags.push(tag);
        break;
      }
    }
  }

  return tags.length > 0 ? tags : ['Unknown'];
}

/**
 * Scan folder for file inventory — catalog files by type per top-level subfolder (household).
 */
async function scanInventory(folderPath) {
  const topLevel = await listFolder(folderPath);
  const households = [];

  for (const folder of (topLevel.folders || [])) {
    const subPath = folder.path || `${folderPath}/${folder.name}`;
    console.error(`  Scanning: ${folder.name}...`);
    const files = await listFolderRecursive(subPath, folder.name);
    const fileItems = files.filter(f => f.type === 'file').map(f => ({
      ...f,
      tags: tagDocument(f.name)
    }));

    households.push({
      name: folder.name,
      path: subPath,
      files: fileItems,
      totalFiles: fileItems.length,
      totalSize: fileItems.reduce((sum, f) => sum + (f.size || 0), 0)
    });
  }

  return households;
}

module.exports = {
  getCurrentUser,
  listFolder,
  getFolderInfo,
  listFolderRecursive,
  scanInventory,
  tagDocument,
  DOCUMENT_TAGS
};
