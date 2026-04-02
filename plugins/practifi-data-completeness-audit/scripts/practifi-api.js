/**
 * Practifi (Salesforce) API wrapper.
 * Uses Salesforce REST API + SOQL for querying Practifi CRM data.
 *
 * Key concepts:
 *   - instance_url: per-org Salesforce instance (e.g. https://na1.salesforce.com)
 *   - Practifi has TWO namespace prefixes: cloupra__ (older SPA) and practifi__ (newer PML)
 *   - Describe API discovers which custom fields exist and which prefix the org uses
 *   - SOQL: Salesforce Object Query Language for querying records
 */

const fetch = require('node-fetch');
const api = require('./lea-skills-api');

const SF_API_VERSION = 'v59.0';

let cachedToken = null;
let cachedInstanceUrl = null;
let tokenExpiresAt = 0;

// ── Token management ────────────────────────────────────────

async function getAuth() {
  // Use cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedInstanceUrl && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return { token: cachedToken, instanceUrl: cachedInstanceUrl };
  }

  const result = await api.getPractifiCredentials();
  cachedToken = result.credentials.access_token;
  cachedInstanceUrl = result.credentials.instance_url;
  const ttl = result.credentials.expires_in
    ? result.credentials.expires_in * 1000
    : 55 * 60 * 1000;
  tokenExpiresAt = Date.now() + ttl;
  return { token: cachedToken, instanceUrl: cachedInstanceUrl };
}

// ── Salesforce REST request helper ──────────────────────────

async function sfRequest(method, path, body) {
  const { token, instanceUrl } = await getAuth();
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const url = `${instanceUrl}/services/data/${SF_API_VERSION}${path}`;
  const response = await fetch(url, opts);

  if (response.status === 401) {
    // Token expired — force refresh and retry once
    try {
      await api.refreshPractifiToken();
      cachedToken = null;
      cachedInstanceUrl = null;
      const auth = await getAuth();
      opts.headers['Authorization'] = `Bearer ${auth.token}`;
      const retryUrl = `${auth.instanceUrl}/services/data/${SF_API_VERSION}${path}`;
      const retry = await fetch(retryUrl, opts);
      if (!retry.ok) {
        const errBody = await retry.text();
        console.error(`Practifi API error ${retry.status}:`, errBody);
        throw new Error(`Practifi API request failed (${retry.status}). Check connection and retry.`);
      }
      return retry.json();
    } catch (err) {
      throw new Error(`Salesforce auth failed after refresh: ${err.message}`);
    }
  }

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`Practifi API error ${response.status}:`, errBody);
    throw new Error(`Practifi API request failed (${response.status}). Check connection and retry.`);
  }

  return response.json();
}

// ── SOQL query helper with pagination ───────────────────────

async function soqlQuery(query) {
  const allRecords = [];
  let result = await sfRequest('GET', `/query?q=${encodeURIComponent(query)}`);
  allRecords.push(...result.records);

  // Follow nextRecordsUrl for pagination (SF returns max 2000 per page)
  while (!result.done && result.nextRecordsUrl) {
    const { token, instanceUrl } = await getAuth();
    const response = await fetch(`${instanceUrl}${result.nextRecordsUrl}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Practifi API error ${response.status}:`, errBody);
      throw new Error(`Practifi API request failed (${response.status}). Check connection and retry.`);
    }
    result = await response.json();
    allRecords.push(...result.records);
  }

  return allRecords;
}

// ── Describe API ────────────────────────────────────────────

async function describeObject(objectName) {
  return sfRequest('GET', `/sobjects/${objectName}/describe`);
}

// ── API methods ─────────────────────────────────────────────

async function getCurrentUser() {
  const { token, instanceUrl } = await getAuth();
  const response = await fetch(`${instanceUrl}/services/oauth2/userinfo`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const errBody = await response.text();
    console.error(`Practifi API error ${response.status}:`, errBody);
    throw new Error(`Practifi API request failed (${response.status}). Check connection and retry.`);
  }
  return response.json();
}

// ── Practifi namespace prefixes ──────────────────────────────
// Older orgs use cloupra__, newer orgs use practifi__. We try both during discovery.
const PRACTIFI_PREFIXES = ['cloupra__', 'practifi__'];

// ── Audit field definitions ─────────────────────────────────
// Fields with `sfSuffix` are custom Practifi fields — discovery tries both prefixes.
// Fields with `sfField` (no suffix) are standard Salesforce fields, always present.

const AUDIT_FIELDS = [
  // Contact Basics
  { key: 'email', label: 'Email Address', group: 'Contact Basics', sfField: 'Email', weight: 3 },
  { key: 'phone', label: 'Phone Number', group: 'Contact Basics', sfField: 'Phone', weight: 3 },
  { key: 'address', label: 'Street Address', group: 'Contact Basics', sfField: 'MailingStreet', weight: 2 },

  // Personal
  { key: 'birth_date', label: 'Date of Birth', group: 'Personal', sfField: 'Birthdate', weight: 2 },
  { key: 'gender', label: 'Gender', group: 'Personal', sfSuffix: 'Gender__c', weight: 1 },
  { key: 'marital_status', label: 'Marital Status', group: 'Personal', sfSuffix: 'Marital_Status__c', weight: 1 },

  // Compliance
  { key: 'ssn', label: 'SSN / Tax ID', group: 'Compliance', sfSuffix: 'SSN__c', weight: 3 },
  { key: 'citizenship_status', label: 'Citizenship Status', group: 'Compliance', sfSuffix: 'Citizenship_Status__c', weight: 2 },
  { key: 'employment_status', label: 'Employment Status', group: 'Compliance', sfSuffix: 'Employment_Status__c', weight: 1 },

  // Relationship
  { key: 'household', label: 'Household Assignment', group: 'Relationship', sfField: 'AccountId', weight: 2 },
  { key: 'contact_source', label: 'Contact Source', group: 'Relationship', sfField: 'LeadSource', weight: 1, fallbackSuffix: 'Source__c' },
  { key: 'client_category', label: 'Client Category', group: 'Relationship', sfSuffix: 'Client_Category__c', weight: 2 },
  { key: 'client_since', label: 'Client Since Date', group: 'Relationship', sfSuffix: 'Client_Since__c', weight: 1 },

  // Financial
  { key: 'total_assets', label: 'Total Assets', group: 'Financial', sfSuffix: 'Total_Assets__c', weight: 1, onAccount: true },
];

// ── Field discovery ─────────────────────────────────────────

/**
 * Resolve a field suffix (e.g. 'Gender__c') to the actual API name by trying
 * both namespace prefixes against the Describe API results.
 * Returns the full API name (e.g. 'practifi__Gender__c') or null if not found.
 */
function resolveFieldName(suffix, fieldNameSet) {
  for (const prefix of PRACTIFI_PREFIXES) {
    const candidate = `${prefix}${suffix}`;
    if (fieldNameSet.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Use Describe API to check which custom fields exist in the org.
 * Tries both cloupra__ and practifi__ prefixes for each custom field.
 * Returns { available, skipped, resolvedFields, contactFieldNames, accountFieldNames, fallbackAvailable }
 */
async function discoverAvailableFields() {
  console.error('  Discovering available fields via Describe API...');

  const [contactDescribe, accountDescribe] = await Promise.all([
    describeObject('Contact'),
    describeObject('Account')
  ]);

  const contactFieldNames = new Set(contactDescribe.fields.map(f => f.name));
  const accountFieldNames = new Set(accountDescribe.fields.map(f => f.name));

  const available = [];
  const skipped = [];
  const resolvedFields = {}; // key -> actual SF API name

  for (const field of AUDIT_FIELDS) {
    // Standard SF fields (have sfField, no sfSuffix) are always present
    if (field.sfField) {
      available.push(field.key);
      resolvedFields[field.key] = field.sfField;
      continue;
    }

    // Custom Practifi fields — try both prefixes
    const targetSet = field.onAccount ? accountFieldNames : contactFieldNames;
    const resolved = resolveFieldName(field.sfSuffix, targetSet);

    if (resolved) {
      available.push(field.key);
      resolvedFields[field.key] = field.onAccount ? `Account.${resolved}` : resolved;
    } else {
      skipped.push(field.key);
    }
  }

  // Check fallback fields (e.g. Source__c as fallback for LeadSource)
  const fallbackAvailable = {};
  for (const field of AUDIT_FIELDS) {
    if (field.fallbackSuffix) {
      const resolved = resolveFieldName(field.fallbackSuffix, contactFieldNames);
      if (resolved) fallbackAvailable[field.key] = resolved;
    }
  }

  return { available, skipped, resolvedFields, contactFieldNames, accountFieldNames, fallbackAvailable };
}

// ── SOQL query builder ──────────────────────────────────────

function buildContactQuery(discovery) {
  // Always-present standard fields
  const selectFields = [
    'Id', 'Name', 'FirstName', 'LastName',
    'Email', 'Phone',
    'MailingStreet', 'MailingCity', 'MailingState', 'MailingPostalCode',
    'Birthdate', 'LeadSource', 'AccountId',
    'Account.Name'
  ];

  // Add resolved custom fields from discovery
  for (const field of AUDIT_FIELDS) {
    if (!field.sfSuffix) continue; // skip standard fields (already in selectFields)
    const resolved = discovery.resolvedFields[field.key];
    if (resolved && !selectFields.includes(resolved)) {
      selectFields.push(resolved);
    }
  }

  // Add fallback fields
  for (const fallbackField of Object.values(discovery.fallbackAvailable)) {
    if (!selectFields.includes(fallbackField)) {
      selectFields.push(fallbackField);
    }
  }

  const uniqueFields = [...new Set(selectFields)];

  return `SELECT ${uniqueFields.join(', ')} FROM Contact WHERE IsDeleted = false ORDER BY LastName, FirstName`;
}

// ── Pull contacts ───────────────────────────────────────────

async function pullContacts(discovery) {
  const query = buildContactQuery(discovery);
  console.error('  Querying contacts via SOQL...');
  const contacts = await soqlQuery(query);
  console.error(`  Fetched ${contacts.length} contacts`);
  return contacts;
}

// ── Contact scoring + audit ─────────────────────────────────

function checkField(contact, field, discovery) {
  const val = getFieldValue(contact, field, discovery);
  return val != null && val !== '' && val !== false;
}

function getFieldValue(contact, field, discovery) {
  // Special cases for composite/standard fields
  switch (field.key) {
    case 'address':
      return contact.MailingStreet || contact.MailingCity || contact.MailingState || contact.MailingPostalCode;
    case 'household':
      return contact.AccountId;
    case 'contact_source': {
      const primary = contact.LeadSource;
      if (primary) return primary;
      if (discovery.fallbackAvailable['contact_source']) {
        return contact[discovery.fallbackAvailable['contact_source']];
      }
      return null;
    }
  }

  // Standard SF fields (have sfField set directly)
  if (field.sfField) {
    return contact[field.sfField];
  }

  // Custom Practifi fields — use resolved name from discovery
  const resolved = discovery.resolvedFields[field.key];
  if (!resolved) return null;

  // Account-level fields (e.g. Account.practifi__Total_Assets__c)
  if (field.onAccount) {
    const accountField = resolved.replace('Account.', '');
    return contact.Account ? contact.Account[accountField] : null;
  }

  return contact[resolved];
}

function scoreContact(contact, availableFields, discovery) {
  let earned = 0;
  let total = 0;

  for (const field of AUDIT_FIELDS) {
    if (!availableFields.includes(field.key)) continue;
    total += field.weight;
    if (checkField(contact, field, discovery)) {
      earned += field.weight;
    }
  }

  return total > 0 ? Math.round((earned / total) * 100) : 0;
}

function auditContacts(contacts, discovery) {
  const availableFields = discovery.available;
  const activeFields = AUDIT_FIELDS.filter(f => availableFields.includes(f.key));

  // Field completeness
  const fieldStats = activeFields.map(field => {
    const withData = contacts.filter(c => checkField(c, field, discovery)).length;
    return {
      key: field.key,
      label: field.label,
      group: field.group,
      withData,
      withoutData: contacts.length - withData,
      percentage: contacts.length > 0 ? Math.round((withData / contacts.length) * 100) : 0
    };
  });

  // Per-contact scores
  const contactScores = contacts.map(c => {
    const score = scoreContact(c, availableFields, discovery);
    const missing = activeFields
      .filter(f => !checkField(c, f, discovery))
      .map(f => f.label);

    return {
      id: c.Id,
      name: c.Name || `${c.FirstName || ''} ${c.LastName || ''}`.trim(),
      email: c.Email || null,
      phone: c.Phone || null,
      birth_date: c.Birthdate || null,
      household: c.Account ? c.Account.Name : null,
      assets: getFieldValue(c, AUDIT_FIELDS.find(f => f.key === 'total_assets'), discovery),
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
    totalContacts: contacts.length,
    fieldsChecked: activeFields.length,
    skippedFields: discovery.skipped,
    averageScore: avgScore,
    needsAttention,
    fieldStats,
    contacts: contactScores
  };
}

module.exports = {
  getCurrentUser,
  describeObject,
  discoverAvailableFields,
  pullContacts,
  auditContacts,
  AUDIT_FIELDS
};
