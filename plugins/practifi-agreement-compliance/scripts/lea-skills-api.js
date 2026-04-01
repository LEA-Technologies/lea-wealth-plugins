/**
 * LEA Skills API client.
 * Handles registration, Practifi OAuth, vault OAuth (Box, SharePoint, Egnyte),
 * credentials, config, and usage tracking.
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const CREDS_DIR = path.join(require('os').homedir(), '.lea-skills');
const TOKEN_FILE = path.join(CREDS_DIR, 'credentials.json');
const API_BASE = process.env.LEA_SKILLS_API || 'https://skills.getlea.io';

// -- Token persistence --

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
    fs.mkdirSync(CREDS_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function getApiToken() {
  const data = loadToken();
  if (!data || !data.api_token) {
    throw new Error('Not registered. Run: register <email>');
  }
  return data.api_token;
}

// -- API helpers --

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

// -- Registration --

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

// -- Practifi (Salesforce) OAuth --

async function getPractifiAuthUrl() {
  return apiRequest('GET', '/api/auth/practifi');
}

async function pollPractifiStatus(sessionId) {
  return apiRequest('GET', `/api/auth/practifi/status?session_id=${encodeURIComponent(sessionId)}`);
}

async function getPractifiCredentials() {
  return apiRequest('GET', '/api/connections/practifi');
}

async function refreshPractifiToken() {
  return apiRequest('POST', '/api/connections/practifi/refresh');
}

// -- Box OAuth --

async function getBoxAuthUrl() {
  return apiRequest('GET', '/api/auth/box');
}

async function pollBoxStatus(sessionId) {
  return apiRequest('GET', `/api/auth/box/status?session_id=${encodeURIComponent(sessionId)}`);
}

async function getBoxCredentials() {
  return apiRequest('GET', '/api/connections/box');
}

async function refreshBoxToken() {
  return apiRequest('POST', '/api/connections/box/refresh');
}

// -- SharePoint OAuth --

async function getSharePointAuthUrl() {
  return apiRequest('GET', '/api/auth/sharepoint');
}

async function pollSharePointStatus(sessionId) {
  return apiRequest('GET', `/api/auth/sharepoint/status?session_id=${encodeURIComponent(sessionId)}`);
}

async function getSharePointCredentials() {
  return apiRequest('GET', '/api/connections/sharepoint');
}

async function refreshSharePointToken() {
  return apiRequest('POST', '/api/connections/sharepoint/refresh');
}

// -- Egnyte OAuth --

async function getEgnyteAuthUrl(domain) {
  return apiRequest('GET', `/api/auth/egnyte?egnyte_domain=${encodeURIComponent(domain)}`);
}

async function pollEgnyteStatus(sessionId) {
  return apiRequest('GET', `/api/auth/egnyte/status?session_id=${encodeURIComponent(sessionId)}`);
}

async function getEgnyteCredentials() {
  return apiRequest('GET', '/api/connections/egnyte');
}

async function refreshEgnyteToken() {
  return apiRequest('POST', '/api/connections/egnyte/refresh');
}

// -- Config & Usage --

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
  loadToken, saveToken, getApiToken, checkSetup, register,
  getPractifiAuthUrl, pollPractifiStatus, getPractifiCredentials, refreshPractifiToken,
  getBoxAuthUrl, pollBoxStatus, getBoxCredentials, refreshBoxToken,
  getSharePointAuthUrl, pollSharePointStatus, getSharePointCredentials, refreshSharePointToken,
  getEgnyteAuthUrl, pollEgnyteStatus, getEgnyteCredentials, refreshEgnyteToken,
  saveConfig, loadConfig, logUsage, API_BASE
};
