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
async function scanInventory(driveId, folderId) {
  const topLevel = await listFolder(driveId, folderId);
  const households = [];

  for (const entry of (topLevel.value || [])) {
    if (!entry.folder) continue;

    console.error(`  Scanning: ${entry.name}...`);
    const files = await listFolderRecursive(driveId, entry.id, entry.name);
    const fileItems = files.filter(f => f.type === 'file').map(f => ({
      ...f,
      tags: tagDocument(f.name)
    }));

    households.push({
      id: entry.id,
      name: entry.name,
      files: fileItems,
      totalFiles: fileItems.length,
      totalSize: fileItems.reduce((sum, f) => sum + (f.size || 0), 0)
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
  listFolderRecursive,
  scanInventory,
  tagDocument,
  DOCUMENT_TAGS
};
