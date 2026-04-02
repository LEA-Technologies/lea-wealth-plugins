/**
 * Wealthbox CRM API wrapper.
 * Pulls contacts and households for agreement compliance cross-referencing.
 * Auth: personal API token via ACCESS_TOKEN header.
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.crmworkspace.com/v1';
const TOKEN_DIR = path.join(require('os').homedir(), '.lea-skills');
const WB_TOKEN_FILE = path.join(TOKEN_DIR, 'wealthbox-token.json');

function loadToken() {
  if (!fs.existsSync(WB_TOKEN_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(WB_TOKEN_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveToken(data) {
  if (!fs.existsSync(TOKEN_DIR)) {
    fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(WB_TOKEN_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function getToken() {
  const data = loadToken();
  if (!data || !data.access_token) {
    throw new Error('Not connected to Wealthbox. Run the skill again to connect.');
  }
  return data;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function wealthboxRequest(method, endpoint, body) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };

  if (token.auth_type === 'api_token') {
    headers['ACCESS_TOKEN'] = token.access_token;
  } else {
    headers['Authorization'] = `Bearer ${token.access_token}`;
  }

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, opts);

  if (response.status === 429) {
    console.error('Rate limit hit, waiting 5 seconds...');
    await sleep(5000);
    const retry = await fetch(url, opts);
    if (!retry.ok) {
      const errBody = await retry.text();
      console.error(`Wealthbox API error ${retry.status}:`, errBody);
      throw new Error(`Wealthbox API request failed (${retry.status}). Check connection and retry.`);
    }
    return retry.json();
  }

  if (response.status === 401) {
    throw new Error('Wealthbox authentication failed. Your token may be expired or invalid. Run the skill again to reconnect.');
  }

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`Wealthbox API error ${response.status}:`, errBody);
    throw new Error(`Wealthbox API request failed (${response.status}). Check connection and retry.`);
  }

  return response.json();
}

async function getCurrentUser() {
  return wealthboxRequest('GET', '/me');
}

/**
 * Fetch all contacts with auto-pagination.
 * Returns only Person-type contacts with household info.
 */
async function getAllContacts() {
  const allContacts = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    console.error(`  Fetching contacts page ${page}...`);
    const result = await wealthboxRequest('GET', `/contacts?page=${page}&per_page=${perPage}`);
    const contacts = result.contacts || [];
    allContacts.push(...contacts);

    if (contacts.length < perPage) break;
    page++;
    await sleep(200);
  }

  return allContacts;
}

/**
 * Extract unique households from contacts.
 * Returns array of { id, name, members: [{name, id}] }
 */
function extractHouseholds(contacts) {
  const householdMap = {};

  for (const c of contacts) {
    if (c.type !== 'Person') continue;
    if (!c.household || !c.household.id) continue;

    const hId = c.household.id;
    if (!householdMap[hId]) {
      householdMap[hId] = {
        id: hId,
        name: c.household.name || `Household ${hId}`,
        members: []
      };
    }

    householdMap[hId].members.push({
      id: c.id,
      name: c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()
    });
  }

  return Object.values(householdMap).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get all contact names (for matching against vault folders when no household assigned).
 * Returns contacts with last_name for matching.
 */
function extractContactNames(contacts) {
  return contacts
    .filter(c => c.type === 'Person')
    .map(c => ({
      id: c.id,
      name: c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
      firstName: c.first_name,
      lastName: c.last_name,
      householdId: c.household && c.household.id ? c.household.id : null,
      householdName: c.household && c.household.name ? c.household.name : null
    }));
}

module.exports = {
  loadToken,
  saveToken,
  getToken,
  getCurrentUser,
  getAllContacts,
  extractHouseholds,
  extractContactNames
};
