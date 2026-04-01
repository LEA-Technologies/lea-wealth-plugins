/**
 * LEA Skills API client.
 * Handles registration, config, and usage tracking.
 * Wealthbox auth is handled locally (API token) for now.
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const CREDS_DIR = path.join(require('os').homedir(), '.lea-skills');
const TOKEN_FILE = path.join(CREDS_DIR, 'credentials.json');
const API_BASE = process.env.LEA_SKILLS_API || 'https://skills.getlea.io';

// ── Token persistence ───────────────────────────────────────

function loadToken() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveToken(data) {
  if (!fs.existsSync(CREDS_DIR)) {
    fs.mkdirSync(CREDS_DIR, { recursive: true });
  }
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
}

function getApiToken() {
  const data = loadToken();
  if (!data || !data.api_token) {
    throw new Error('Not registered. Run: register <email>');
  }
  return data.api_token;
}

// ── API helpers ─────────────────────────────────────────────

async function apiRequest(method, path, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    headers['Authorization'] = `Bearer ${getApiToken()}`;
  }

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE}${path}`, opts);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `API ${response.status}: ${response.statusText}`);
  }

  return data;
}

// ── Public methods ──────────────────────────────────────────

function checkSetup() {
  const data = loadToken();
  return {
    registered: !!(data && data.api_token),
    email: data ? data.email : null,
    customer_id: data ? data.customer_id : null
  };
}

async function register(email, firmName) {
  const body = { email };
  if (firmName) body.firm_name = firmName;

  const result = await apiRequest('POST', '/api/register', body, false);

  saveToken({
    api_token: result.api_token,
    customer_id: result.customer_id,
    email: result.email,
    firm_name: result.firm_name
  });

  return result;
}

async function saveConfig(skill, config) {
  return apiRequest('PUT', `/api/config/${encodeURIComponent(skill)}`, { config });
}

async function loadConfig(skill) {
  return apiRequest('GET', `/api/config/${encodeURIComponent(skill)}`);
}

async function logUsage(skill) {
  return apiRequest('POST', '/api/usage', { skill_name: skill });
}

module.exports = {
  checkSetup,
  register,
  saveConfig,
  loadConfig,
  logUsage
};
