/**
 * Practifi (Salesforce) API wrapper -- simplified for agreement compliance.
 * Only needs household extraction (not field auditing).
 *
 * Uses Salesforce REST API + SOQL to pull Accounts (households) with their Contacts.
 * Handles the Practifi namespace prefix issue (cloupra__ vs practifi__).
 */

const fetch = require('node-fetch');
const api = require('./lea-skills-api');

const SF_API_VERSION = 'v59.0';

let cachedToken = null;
let cachedInstanceUrl = null;
let tokenExpiresAt = 0;

// -- Token management --

async function getAuth() {
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

// -- Salesforce REST request helper --

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

// -- SOQL query helper with pagination --

async function soqlQuery(query) {
  const allRecords = [];
  let result = await sfRequest('GET', `/query?q=${encodeURIComponent(query)}`);
  allRecords.push(...result.records);

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

// -- API methods --

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

/**
 * Pull households (Accounts) with their Contacts from Practifi.
 * Returns normalized format: [{ id, name, members: [{ id, name }] }]
 */
async function getHouseholds() {
  console.error('  Querying households via SOQL...');

  const query = `SELECT Id, Name, (SELECT Id, Name, FirstName, LastName FROM Contacts) FROM Account WHERE IsDeleted = false ORDER BY Name`;
  const accounts = await soqlQuery(query);

  const households = [];
  for (const account of accounts) {
    const contacts = (account.Contacts && account.Contacts.records) || [];
    // Skip accounts with no contacts (likely not real households)
    if (contacts.length === 0) continue;

    const members = contacts.map(c => ({
      id: c.Id,
      name: c.Name || `${c.FirstName || ''} ${c.LastName || ''}`.trim()
    }));

    households.push({
      id: account.Id,
      name: account.Name,
      members
    });
  }

  console.error(`  Found ${households.length} households with contacts`);
  return households;
}

module.exports = {
  getCurrentUser,
  getHouseholds
};
