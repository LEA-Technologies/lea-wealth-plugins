/**
 * LEA Skills API client.
 * Handles registration, OAuth, credentials, config, and usage tracking.
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

// ── Public API ──────────────────────────────────────────────

async function register(email, firmName) {
  const data = await apiRequest('POST', '/api/register', { email, firm_name: firmName }, false);
  saveToken({
    api_token: data.api_token,
    customer_id: data.customer_id,
    email: data.email,
    firm_name: data.firm_name
  });
  return data;
}

async function getSharePointAuthUrl() {
  return apiRequest('GET', '/api/auth/sharepoint');
}

async function pollSharePointStatus(sessionId) {
  return apiRequest('GET', `/api/auth/sharepoint/status?session_id=${sessionId}`);
}

async function getSharePointCredentials() {
  return apiRequest('GET', '/api/connections/sharepoint');
}

async function refreshSharePointToken() {
  return apiRequest('POST', '/api/connections/sharepoint/refresh');
}

async function loadConfig(skillName) {
  return apiRequest('GET', `/api/config/${skillName}`);
}

async function saveConfig(skillName, config) {
  return apiRequest('PUT', `/api/config/${skillName}`, { config });
}

async function logUsage(skillName) {
  return apiRequest('POST', '/api/usage', { skill_name: skillName });
}

function checkSetup() {
  const token = loadToken();
  return {
    registered: !!token,
    email: token?.email || null,
    customer_id: token?.customer_id || null
  };
}

module.exports = {
  loadToken,
  saveToken,
  getApiToken,
  register,
  getSharePointAuthUrl,
  pollSharePointStatus,
  getSharePointCredentials,
  refreshSharePointToken,
  loadConfig,
  saveConfig,
  logUsage,
  checkSetup,
  API_BASE
};
