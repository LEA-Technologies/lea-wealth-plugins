/**
 * Wealthbox CRM API wrapper.
 * Supports two auth modes:
 *   1. Personal API token (via ACCESS_TOKEN header)
 *   2. OAuth access token (via Authorization: Bearer header) -- future
 *
 * API base: https://api.crmworkspace.com/v1
 * Rate limit: 1 req/sec averaged over 5 minutes. We add 200ms delay between requests.
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.crmworkspace.com/v1';
const TOKEN_DIR = path.join(require('os').homedir(), '.lea-skills');
const WB_TOKEN_FILE = path.join(TOKEN_DIR, 'wealthbox-token.json');

// ── Token management ────────────────────────────────────────

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
    fs.mkdirSync(TOKEN_DIR, { recursive: true });
  }
  fs.writeFileSync(WB_TOKEN_FILE, JSON.stringify(data, null, 2));
}

function getToken() {
  const data = loadToken();
  if (!data || !data.access_token) {
    throw new Error('Not connected to Wealthbox. Run the skill again to connect.');
  }
  return data;
}

// ── API request helper ──────────────────────────────────────

async function wealthboxRequest(method, endpoint, body) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };

  // Support both API token and OAuth token
  if (token.auth_type === 'api_token') {
    headers['ACCESS_TOKEN'] = token.access_token;
  } else {
    headers['Authorization'] = `Bearer ${token.access_token}`;
  }

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, opts);

  // Rate limit hit
  if (response.status === 429) {
    console.error('Rate limit hit, waiting 5 seconds...');
    await sleep(5000);
    const retry = await fetch(url, opts);
    if (!retry.ok) {
      const errBody = await retry.text();
      throw new Error(`Wealthbox API ${retry.status}: ${errBody}`);
    }
    return retry.json();
  }

  // Auth failure
  if (response.status === 401) {
    throw new Error('Wealthbox authentication failed. Your token may be expired or invalid. Run the skill again to reconnect.');
  }

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Wealthbox API ${response.status}: ${errBody}`);
  }

  return response.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── API methods ─────────────────────────────────────────────

async function getCurrentUser() {
  return wealthboxRequest('GET', '/me');
}

async function listContacts(page = 1, perPage = 25) {
  return wealthboxRequest('GET', `/contacts?page=${page}&per_page=${perPage}`);
}

/**
 * Fetch all contacts with auto-pagination.
 * Adds 200ms delay between pages to respect rate limits.
 */
async function getAllContacts() {
  const allContacts = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    console.error(`  Fetching contacts page ${page}...`);
    const result = await listContacts(page, perPage);
    const contacts = result.contacts || [];
    allContacts.push(...contacts);

    if (contacts.length < perPage) break;
    page++;
    await sleep(200);
  }

  return allContacts;
}

// ── Data completeness analysis ───────────────────────────────────

const AUDIT_FIELDS = [
  // Contact basics
  { key: 'email', label: 'Email Address', group: 'Contact Basics', check: c => (c.email_addresses || []).length > 0 },
  { key: 'phone', label: 'Phone Number', group: 'Contact Basics', check: c => (c.phone_numbers || []).length > 0 },
  { key: 'address', label: 'Street Address', group: 'Contact Basics', check: c => (c.street_addresses || []).length > 0 },

  // Personal
  { key: 'birth_date', label: 'Date of Birth', group: 'Personal', check: c => !!c.birth_date && c.birth_date !== '' },
  { key: 'gender', label: 'Gender', group: 'Personal', check: c => !!c.gender && c.gender !== '' },
  { key: 'marital_status', label: 'Marital Status', group: 'Personal', check: c => !!c.marital_status && c.marital_status !== '' },

  // Relationship
  { key: 'household', label: 'Household Assignment', group: 'Relationship', check: c => !!(c.household && c.household.id) },
  { key: 'contact_source', label: 'Contact Source', group: 'Relationship', check: c => !!c.contact_source },
  { key: 'client_since', label: 'Client Since Date', group: 'Relationship', check: c => !!c.client_since && c.client_since !== '' },
  { key: 'tags', label: 'Tags', group: 'Relationship', check: c => (c.tags || []).length > 0 },

  // Financial
  { key: 'assets', label: 'Assets', group: 'Financial', check: c => c.assets != null && c.assets !== '' },
  { key: 'gross_annual_income', label: 'Gross Annual Income', group: 'Financial', check: c => c.gross_annual_income != null && c.gross_annual_income !== '' },

  // Compliance
  { key: 'signed_fee', label: 'Fee Agreement Date', group: 'Compliance', check: c => !!c.signed_fee_agreement_date && c.signed_fee_agreement_date !== '' },
  { key: 'signed_ips', label: 'IPS Agreement Date', group: 'Compliance', check: c => !!c.signed_ips_agreement_date && c.signed_ips_agreement_date !== '' },
];

/**
 * Score a single contact (0-100).
 * Weights: basics (email, phone, address) count more than optional fields.
 */
function scoreContact(contact) {
  const weights = {
    email: 3,
    phone: 3,
    address: 2,
    birth_date: 2,
    household: 2,
    client_since: 2,
    contact_source: 1,
    gender: 1,
    marital_status: 1,
    tags: 1,
    assets: 1,
    gross_annual_income: 1,
    signed_fee: 1,
    signed_ips: 1,
  };

  let earned = 0;
  let total = 0;

  for (const field of AUDIT_FIELDS) {
    const w = weights[field.key] || 1;
    total += w;
    if (field.check(contact)) earned += w;
  }

  return Math.round((earned / total) * 100);
}

/**
 * Analyze all contacts and return audit results.
 */
function auditContacts(contacts) {
  // Only audit Person contacts (skip Companies, Trusts, etc.)
  const people = contacts.filter(c => c.type === 'Person');

  // Field completeness
  const fieldStats = AUDIT_FIELDS.map(field => {
    const withData = people.filter(c => field.check(c)).length;
    return {
      key: field.key,
      label: field.label,
      group: field.group,
      withData,
      withoutData: people.length - withData,
      percentage: people.length > 0 ? Math.round((withData / people.length) * 100) : 0
    };
  });

  // Per-contact scores
  const contactScores = people.map(c => {
    const score = scoreContact(c);
    const missing = AUDIT_FIELDS.filter(f => !f.check(c)).map(f => f.label);
    return {
      id: c.id,
      name: c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
      email: (c.email_addresses || []).map(e => e.address).join(', ') || null,
      phone: (c.phone_numbers || []).map(p => p.address).join(', ') || null,
      birth_date: c.birth_date || null,
      household: c.household && c.household.name ? c.household.name : null,
      assets: c.assets,
      status: c.status,
      score,
      missingCount: missing.length,
      missingFields: missing
    };
  });

  // Sort worst first
  contactScores.sort((a, b) => a.score - b.score);

  const avgScore = contactScores.length > 0
    ? Math.round(contactScores.reduce((sum, c) => sum + c.score, 0) / contactScores.length)
    : 0;

  const needsAttention = contactScores.filter(c => c.score < 50).length;

  return {
    totalContacts: people.length,
    totalAllTypes: contacts.length,
    skippedNonPerson: contacts.length - people.length,
    averageScore: avgScore,
    needsAttention,
    fieldStats,
    contacts: contactScores
  };
}

module.exports = {
  loadToken,
  saveToken,
  getToken,
  getCurrentUser,
  listContacts,
  getAllContacts,
  auditContacts,
  scoreContact,
  AUDIT_FIELDS
};
