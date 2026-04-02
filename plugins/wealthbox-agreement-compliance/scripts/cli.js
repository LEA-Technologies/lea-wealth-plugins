#!/usr/bin/env node

/**
 * Wealthbox Agreement Compliance CLI
 *
 * Usage:
 *   node cli.js check-setup
 *   node cli.js register <email> [firm_name]
 *   node cli.js auth-wealthbox-token <token>
 *   node cli.js verify-wealthbox
 *   node cli.js get-households
 *   node cli.js auth-box
 *   node cli.js poll-box-wait <session_id>
 *   node cli.js verify-box
 *   node cli.js auth-sharepoint
 *   node cli.js poll-sharepoint-wait <session_id>
 *   node cli.js verify-sharepoint
 *   node cli.js auth-egnyte <domain>
 *   node cli.js poll-egnyte-wait <session_id>
 *   node cli.js verify-egnyte
 *   node cli.js list-folders <platform> <folder_ref> [drive_id]
 *   node cli.js scan-compliance <platform> <folder_ref> [drive_id]
 *   node cli.js generate-report compliance --output-file <path> --data-file <path>
 *   node cli.js save-config <skill> <json>
 *   node cli.js load-config <skill>
 *   node cli.js log-usage <skill>
 *
 * All commands output JSON to stdout. Logs go to stderr.
 */

const path = require('path');
const fs = require('fs');

const originalLog = console.log;
console.log = (...args) => process.stderr.write(args.join(' ') + '\n');

function output(data) {
  originalLog(JSON.stringify(data, null, 2));
}

function fail(message, code = 1) {
  output({ success: false, error: message });
  process.exit(code);
}

// ── Commands ────────────────────────────────────────────────

async function cmdCheckSetup() {
  const api = require('./lea-skills-api');
  const wb = require('./wealthbox-api');
  const setup = api.checkSetup();

  let wealthboxConnected = false;
  if (setup.registered) {
    try {
      wb.getToken();
      wealthboxConnected = true;
    } catch (e) {}
  }

  // Check vault connections
  let boxConnected = false, sharepointConnected = false, egnyteConnected = false;
  if (setup.registered) {
    try { await api.getBoxCredentials(); boxConnected = true; } catch (e) {}
    try { await api.getSharePointCredentials(); sharepointConnected = true; } catch (e) {}
    try { await api.getEgnyteCredentials(); egnyteConnected = true; } catch (e) {}
  }

  output({
    success: true,
    registered: setup.registered,
    email: setup.email,
    customer_id: setup.customer_id,
    wealthbox_connected: wealthboxConnected,
    box_connected: boxConnected,
    sharepoint_connected: sharepointConnected,
    egnyte_connected: egnyteConnected
  });
}

async function cmdRegister(email, firmName) {
  if (!email) fail('Usage: cli.js register <email> [firm_name]');
  const api = require('./lea-skills-api');
  try {
    const result = await api.register(email, firmName);
    output({ success: true, customer_id: result.customer_id, email: result.email, firm_name: result.firm_name });
  } catch (err) { fail(err.message); }
}

async function cmdAuthWealthboxToken(token) {
  if (!token) fail('Usage: cli.js auth-wealthbox-token <token>');
  const wb = require('./wealthbox-api');
  wb.saveToken({ access_token: token, auth_type: 'api_token', saved_at: new Date().toISOString() });
  try {
    const user = await wb.getCurrentUser();
    output({ success: true, user: { name: user.name, email: user.email, plan: user.plan } });
  } catch (err) {
    wb.saveToken({});
    fail(`Token verification failed: ${err.message}`);
  }
}

async function cmdVerifyWealthbox() {
  const wb = require('./wealthbox-api');
  try {
    const user = await wb.getCurrentUser();
    output({ success: true, user: { name: user.name, email: user.email, plan: user.plan } });
  } catch (err) { fail(err.message); }
}

async function cmdGetHouseholds() {
  const wb = require('./wealthbox-api');
  try {
    console.log('Pulling contacts from Wealthbox...');
    const contacts = await wb.getAllContacts();
    const households = wb.extractHouseholds(contacts);
    const allNames = wb.extractContactNames(contacts);

    output({
      success: true,
      totalContacts: contacts.filter(c => c.type === 'Person').length,
      totalHouseholds: households.length,
      contactsWithoutHousehold: allNames.filter(c => !c.householdId).length,
      households,
      contacts: allNames
    });
  } catch (err) { fail(err.message); }
}

// ── Vault Auth Commands ─────────────────────────────────────

async function cmdAuthBox() {
  const api = require('./lea-skills-api');
  try {
    const result = await api.getBoxAuthUrl();
    output({ success: true, auth_url: result.auth_url, session_id: result.session_id });
  } catch (err) { fail(err.message); }
}

async function cmdPollBoxWait(sessionId) {
  if (!sessionId) fail('Usage: cli.js poll-box-wait <session_id>');
  const api = require('./lea-skills-api');
  for (let i = 0; i < 24; i++) {
    try {
      const result = await api.pollBoxStatus(sessionId);
      if (result.status === 'connected') { output({ success: true, status: 'connected' }); return; }
      if (result.status === 'failed' || result.status === 'expired') { output({ success: false, status: result.status }); return; }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 5000));
  }
  output({ success: false, status: 'timeout', error: 'Authorization timed out after 2 minutes' });
}

async function cmdVerifyBox() {
  const vault = require('./vault-api');
  vault.setPlatform('box');
  try {
    const user = await vault.verifyVaultConnection();
    output({ success: true, user: { name: user.name, login: user.login } });
  } catch (err) { fail(err.message); }
}

async function cmdAuthSharePoint() {
  const api = require('./lea-skills-api');
  try {
    const result = await api.getSharePointAuthUrl();
    output({ success: true, auth_url: result.auth_url, session_id: result.session_id });
  } catch (err) { fail(err.message); }
}

async function cmdPollSharePointWait(sessionId) {
  if (!sessionId) fail('Usage: cli.js poll-sharepoint-wait <session_id>');
  const api = require('./lea-skills-api');
  for (let i = 0; i < 24; i++) {
    try {
      const result = await api.pollSharePointStatus(sessionId);
      if (result.status === 'connected') { output({ success: true, status: 'connected' }); return; }
      if (result.status === 'failed' || result.status === 'expired') { output({ success: false, status: result.status }); return; }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 5000));
  }
  output({ success: false, status: 'timeout', error: 'Authorization timed out after 2 minutes' });
}

async function cmdVerifySharePoint() {
  const vault = require('./vault-api');
  vault.setPlatform('sharepoint');
  try {
    const user = await vault.verifyVaultConnection();
    output({ success: true, user: { name: user.displayName, email: user.mail } });
  } catch (err) { fail(err.message); }
}

async function cmdAuthEgnyte(domain) {
  if (!domain) fail('Usage: cli.js auth-egnyte <domain>');
  const api = require('./lea-skills-api');
  try {
    const result = await api.getEgnyteAuthUrl(domain);
    output({ success: true, auth_url: result.auth_url, session_id: result.session_id });
  } catch (err) { fail(err.message); }
}

async function cmdPollEgnyteWait(sessionId) {
  if (!sessionId) fail('Usage: cli.js poll-egnyte-wait <session_id>');
  const api = require('./lea-skills-api');
  for (let i = 0; i < 24; i++) {
    try {
      const result = await api.pollEgnyteStatus(sessionId);
      if (result.status === 'connected') { output({ success: true, status: 'connected' }); return; }
      if (result.status === 'failed' || result.status === 'expired') { output({ success: false, status: result.status }); return; }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 5000));
  }
  output({ success: false, status: 'timeout', error: 'Authorization timed out after 2 minutes' });
}

async function cmdVerifyEgnyte() {
  const vault = require('./vault-api');
  vault.setPlatform('egnyte');
  try {
    const user = await vault.verifyVaultConnection();
    output({ success: true, user: { name: `${user.first_name} ${user.last_name}`, email: user.email } });
  } catch (err) { fail(err.message); }
}

// ── Vault Folder Browsing ───────────────────────────────────

async function cmdListFolders(platform, folderRef, driveId) {
  if (!platform || !folderRef) fail('Usage: cli.js list-folders <platform> <folder_ref> [drive_id]');
  const vault = require('./vault-api');
  vault.setPlatform(platform);

  try {
    const result = await vault.listFolder(folderRef, driveId);
    const entries = [];

    if (platform === 'box') {
      for (const e of (result.entries || [])) {
        entries.push({ name: e.name, type: e.type, id: e.id });
      }
    } else if (platform === 'sharepoint') {
      for (const e of (result.value || [])) {
        entries.push({ name: e.name, type: e.folder ? 'folder' : 'file', id: e.id });
      }
    } else if (platform === 'egnyte') {
      for (const f of (result.folders || [])) {
        entries.push({ name: f.name, type: 'folder', path: f.path || `${folderRef}/${f.name}` });
      }
      for (const f of (result.files || [])) {
        entries.push({ name: f.name, type: 'file', path: `${folderRef}/${f.name}` });
      }
    }

    output({ success: true, platform, entries });
  } catch (err) { fail(err.message); }
}

// ── SharePoint Site/Drive Browsing ──────────────────────────

async function cmdListSites() {
  const vault = require('./vault-api');
  try {
    const result = await vault.spListSites();
    const sites = (result.value || []).map(s => ({ id: s.id, name: s.displayName, webUrl: s.webUrl }));
    output({ success: true, sites });
  } catch (err) { fail(err.message); }
}

async function cmdListDrives(siteId) {
  if (!siteId) fail('Usage: cli.js list-drives <site_id>');
  const vault = require('./vault-api');
  try {
    const result = await vault.spListDrives(siteId);
    const drives = (result.value || []).map(d => ({ id: d.id, name: d.name, driveType: d.driveType }));
    output({ success: true, drives });
  } catch (err) { fail(err.message); }
}

// ── Compliance Scan ─────────────────────────────────────────

async function cmdScanCompliance(platform, folderRef, driveId) {
  if (!platform || !folderRef) fail('Usage: cli.js scan-compliance <platform> <folder_ref> [drive_id]');

  const vault = require('./vault-api');
  const wb = require('./wealthbox-api');

  vault.setPlatform(platform);

  try {
    // 1. Get households from Wealthbox
    console.log('Pulling households from Wealthbox...');
    const contacts = await wb.getAllContacts();
    const households = wb.extractHouseholds(contacts);
    const allNames = wb.extractContactNames(contacts);

    // 2. Scan vault for agreements
    console.log(`Scanning ${platform} vault for agreements...`);
    const vaultHouseholds = await vault.scanAgreements(folderRef, driveId);

    // 3. Cross-reference: match WB households/contacts to vault folders
    const results = crossReference(households, allNames, vaultHouseholds);

    output({
      success: true,
      platform,
      ...results
    });
  } catch (err) { fail(err.message); }
}

/**
 * Cross-reference Wealthbox households with vault scan results.
 * Matching strategy: case-insensitive folder name contains last name or household name.
 */
function crossReference(wbHouseholds, wbContacts, vaultHouseholds) {
  const matched = [];
  const unmatchedWb = [];
  const unmatchedVault = [];

  // Build lookup from vault folder names (lowercased)
  const vaultByName = {};
  for (const vh of vaultHouseholds) {
    vaultByName[vh.name.toLowerCase()] = vh;
  }

  // Try to match each WB household to a vault folder
  const matchedVaultNames = new Set();

  for (const wbh of wbHouseholds) {
    const wbName = wbh.name.toLowerCase();
    let vaultMatch = null;

    // Exact match
    if (vaultByName[wbName]) {
      vaultMatch = vaultByName[wbName];
    } else {
      // Fuzzy: check if any vault folder contains the household name or vice versa
      for (const [vName, vh] of Object.entries(vaultByName)) {
        if (vName.includes(wbName) || wbName.includes(vName)) {
          vaultMatch = vh;
          break;
        }
      }
    }

    // If no household match, try matching by member last names
    if (!vaultMatch) {
      for (const member of wbh.members) {
        const lastName = (member.name.split(' ').pop() || '').toLowerCase();
        if (lastName && vaultByName[lastName]) {
          vaultMatch = vaultByName[lastName];
          break;
        }
        for (const [vName, vh] of Object.entries(vaultByName)) {
          if (lastName && (vName.includes(lastName) || lastName.includes(vName))) {
            vaultMatch = vh;
            break;
          }
        }
        if (vaultMatch) break;
      }
    }

    if (vaultMatch) {
      matchedVaultNames.add(vaultMatch.name.toLowerCase());
      const agreementTypes = {};
      for (const a of vaultMatch.agreements) {
        const aType = a.type || 'CA';
        agreementTypes[aType] = (agreementTypes[aType] || 0) + 1;
      }
      matched.push({
        householdName: wbh.name,
        householdId: wbh.id,
        memberCount: wbh.members.length,
        vaultFolder: vaultMatch.name,
        totalFiles: vaultMatch.totalFiles,
        agreementCount: vaultMatch.agreementCount,
        agreementTypes,
        hasCEA: !!agreementTypes['CEA'],
        hasIMA: !!agreementTypes['IMA'],
        hasIPS: !!agreementTypes['IPS'],
        hasCA: !!agreementTypes['CA']
      });
    } else {
      unmatchedWb.push({
        householdName: wbh.name,
        householdId: wbh.id,
        memberCount: wbh.members.length,
        reason: 'No matching vault folder found'
      });
    }
  }

  // Vault folders with no WB match
  for (const vh of vaultHouseholds) {
    if (!matchedVaultNames.has(vh.name.toLowerCase())) {
      unmatchedVault.push({
        folderName: vh.name,
        totalFiles: vh.totalFiles,
        agreementCount: vh.agreementCount,
        reason: 'No matching Wealthbox household'
      });
    }
  }

  // Summary stats
  const totalMatched = matched.length;
  const withAllAgreements = matched.filter(m => m.hasCEA && m.hasIMA && m.hasIPS).length;
  const missingAny = matched.filter(m => !m.hasCEA || !m.hasIMA || !m.hasIPS).length;

  return {
    totalWbHouseholds: wbHouseholds.length,
    totalWbContacts: wbContacts.length,
    totalVaultFolders: vaultHouseholds.length,
    totalMatched,
    totalUnmatchedWb: unmatchedWb.length,
    totalUnmatchedVault: unmatchedVault.length,
    withAllAgreements,
    missingAny,
    matched,
    unmatchedWb,
    unmatchedVault
  };
}

// ── Report Generation ───────────────────────────────────────

async function cmdGenerateReport(type, extraArgs) {
  if (!type) fail('Usage: cli.js generate-report compliance --output-file <path> --data-file <path>');

  const report = require('./report');
  let outputFile = null;
  let dataFile = null;
  for (let i = 0; i < extraArgs.length; i++) {
    if (extraArgs[i] === '--output-file' && extraArgs[i + 1]) outputFile = extraArgs[i + 1];
    if (extraArgs[i] === '--data-file' && extraArgs[i + 1]) dataFile = extraArgs[i + 1];
  }

  if (!outputFile) fail('--output-file is required');
  if (!dataFile) fail('--data-file is required');

  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    report.generateReport(type, data, outputFile);
    output({ success: true, type, output_file: outputFile });
  } catch (err) { fail(err.message); }
}

// ── Config/Usage ────────────────────────────────────────────

async function cmdSaveConfig(skill, jsonStr) {
  if (!skill || !jsonStr) fail('Usage: cli.js save-config <skill_name> \'<json>\'');
  const api = require('./lea-skills-api');

  let config;
  try {
    config = JSON.parse(jsonStr);
  } catch (e) {
    fail(`Invalid JSON: ${e.message}`);
  }

  if (typeof config !== 'object' || config === null) {
    fail('Expected JSON object');
  }

  try {
    const result = await api.saveConfig(skill, config);
    output({ success: true, skill_name: skill, config: result.config });
  } catch (err) { fail(err.message); }
}

async function cmdLoadConfig(skill) {
  if (!skill) fail('Usage: cli.js load-config <skill_name>');
  const api = require('./lea-skills-api');
  try {
    const result = await api.loadConfig(skill);
    output({ success: true, skill_name: skill, config: result.config });
  } catch (err) { fail(err.message); }
}

async function cmdLogUsage(skill) {
  if (!skill) fail('Usage: cli.js log-usage <skill_name>');
  const api = require('./lea-skills-api');
  try {
    const result = await api.logUsage(skill);
    output({ success: true, skill_name: skill, total_runs: result.total_runs });
  } catch (err) { fail(err.message); }
}

// ── Dispatcher ──────────────────────────────────────────────

const [,, command, ...args] = process.argv;

const commands = {
  'check-setup': () => cmdCheckSetup(),
  'register': () => cmdRegister(args[0], args[1]),
  'auth-wealthbox-token': () => cmdAuthWealthboxToken(args[0]),
  'verify-wealthbox': () => cmdVerifyWealthbox(),
  'get-households': () => cmdGetHouseholds(),
  'auth-box': () => cmdAuthBox(),
  'poll-box-wait': () => cmdPollBoxWait(args[0]),
  'verify-box': () => cmdVerifyBox(),
  'auth-sharepoint': () => cmdAuthSharePoint(),
  'poll-sharepoint-wait': () => cmdPollSharePointWait(args[0]),
  'verify-sharepoint': () => cmdVerifySharePoint(),
  'auth-egnyte': () => cmdAuthEgnyte(args[0]),
  'poll-egnyte-wait': () => cmdPollEgnyteWait(args[0]),
  'verify-egnyte': () => cmdVerifyEgnyte(),
  'list-sites': () => cmdListSites(),
  'list-drives': () => cmdListDrives(args[0]),
  'list-folders': () => cmdListFolders(args[0], args[1], args[2]),
  'scan-compliance': () => cmdScanCompliance(args[0], args[1], args[2]),
  'generate-report': () => cmdGenerateReport(args[0], args.slice(1)),
  'save-config': () => cmdSaveConfig(args[0], args[1]),
  'load-config': () => cmdLoadConfig(args[0]),
  'log-usage': () => cmdLogUsage(args[0])
};

if (!command || !commands[command]) {
  console.log('Wealthbox Agreement Compliance CLI');
  console.log('');
  console.log('Commands:');
  console.log('  check-setup                          Check all connection status');
  console.log('  register <email> [firm]               Register with LEA Skills API');
  console.log('  auth-wealthbox-token <token>           Connect Wealthbox via API token');
  console.log('  verify-wealthbox                      Verify Wealthbox connection');
  console.log('  get-households                        Pull households from Wealthbox');
  console.log('  auth-box / auth-sharepoint / auth-egnyte <domain>');
  console.log('  poll-box-wait / poll-sharepoint-wait / poll-egnyte-wait <session_id>');
  console.log('  verify-box / verify-sharepoint / verify-egnyte');
  console.log('  list-sites                            List SharePoint sites');
  console.log('  list-drives <site_id>                 List SharePoint drives');
  console.log('  list-folders <platform> <ref> [drive]  List folder contents');
  console.log('  scan-compliance <platform> <ref> [drive]  Cross-reference WB + vault');
  console.log('  generate-report compliance --output-file <path> --data-file <path>');
  process.exit(command ? 1 : 0);
}

commands[command]().catch(err => { fail(err.message); });
