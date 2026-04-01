#!/usr/bin/env node

/**
 * SharePoint Client File Inventory CLI — JSON-outputting command dispatcher
 *
 * Usage:
 *   node cli.js check-setup
 *   node cli.js register <email> [firm_name]
 *   node cli.js auth-sharepoint
 *   node cli.js poll-sharepoint <session_id>
 *   node cli.js poll-sharepoint-wait <session_id>
 *   node cli.js verify-sharepoint
 *   node cli.js list-sites
 *   node cli.js list-libraries <site_id>
 *   node cli.js list-folders <drive_id> [item_id]
 *   node cli.js scan-inventory <drive_id> <folder_id>
 *   node cli.js generate-report inventory --output-file <path>
 *   node cli.js save-config <skill> <json>
 *   node cli.js load-config <skill>
 *   node cli.js log-usage <skill>
 *
 * All commands output JSON to stdout. Logs go to stderr.
 */

const path = require('path');
const fs = require('fs');

// Redirect console.log to stderr so stdout stays clean for JSON
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
  const setup = api.checkSetup();

  let sharepointConnected = false;
  if (setup.registered) {
    try {
      await api.getSharePointCredentials();
      sharepointConnected = true;
    } catch (e) {
      // Not connected
    }
  }

  output({
    success: true,
    registered: setup.registered,
    email: setup.email,
    customer_id: setup.customer_id,
    sharepoint_connected: sharepointConnected
  });
}

async function cmdRegister(email, firmName) {
  if (!email) fail('Usage: cli.js register <email> [firm_name]');

  const api = require('./lea-skills-api');

  try {
    const result = await api.register(email, firmName);
    output({
      success: true,
      customer_id: result.customer_id,
      email: result.email,
      firm_name: result.firm_name,
      message: 'Registration successful. API token saved locally.'
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdAuthSharePoint() {
  const api = require('./lea-skills-api');

  try {
    const result = await api.getSharePointAuthUrl();
    output({
      success: true,
      auth_url: result.auth_url,
      session_id: result.session_id
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdPollSharePoint(sessionId) {
  if (!sessionId) fail('Usage: cli.js poll-sharepoint <session_id>');

  const api = require('./lea-skills-api');

  try {
    const result = await api.pollSharePointStatus(sessionId);
    output({ success: true, status: result.status });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdPollSharePointWait(sessionId) {
  if (!sessionId) fail('Usage: cli.js poll-sharepoint-wait <session_id>');

  const api = require('./lea-skills-api');
  const maxAttempts = 24; // 24 × 5s = 2 minutes

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await api.pollSharePointStatus(sessionId);
      if (result.status === 'connected') {
        output({ success: true, status: 'connected' });
        return;
      }
      if (result.status === 'failed' || result.status === 'expired') {
        output({ success: false, status: result.status, error: result.error || 'Authorization failed or expired' });
        return;
      }
    } catch (err) {
      // Network blip — keep trying
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  output({ success: false, status: 'timeout', error: 'Authorization timed out after 2 minutes' });
}

async function cmdVerifySharePoint() {
  const sp = require('./sharepoint-api');

  try {
    const user = await sp.getCurrentUser();
    output({
      success: true,
      user: {
        displayName: user.displayName,
        mail: user.mail || user.userPrincipalName
      }
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdListSites() {
  const sp = require('./sharepoint-api');

  try {
    const result = await sp.listSites();
    const sites = (result.value || []).map(s => ({
      id: s.id,
      name: s.displayName,
      webUrl: s.webUrl
    }));

    output({ success: true, sites });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdListLibraries(siteId) {
  if (!siteId) fail('Usage: cli.js list-libraries <site_id>');

  const sp = require('./sharepoint-api');

  try {
    const result = await sp.listDrives(siteId);
    const drives = (result.value || []).map(d => ({
      id: d.id,
      name: d.name,
      description: d.description || null,
      webUrl: d.webUrl
    }));

    output({ success: true, site_id: siteId, drives });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdListFolders(driveId, itemId) {
  if (!driveId) fail('Usage: cli.js list-folders <drive_id> [item_id]');

  const sp = require('./sharepoint-api');

  try {
    const result = await sp.listFolder(driveId, itemId);
    const entries = (result.value || []).map(e => ({
      id: e.id,
      name: e.name,
      type: e.folder ? 'folder' : 'file',
      size: e.size || null,
      lastModifiedDateTime: e.lastModifiedDateTime || null
    }));

    output({ success: true, drive_id: driveId, item_id: itemId || 'root', entries });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdScanInventory(driveId, folderId) {
  if (!driveId) fail('Usage: cli.js scan-inventory <drive_id> <folder_id> [--report <path>]');

  const sp = require('./sharepoint-api');

  // Parse --report flag
  const reportIdx = args.indexOf('--report');
  const reportPath = reportIdx !== -1 ? args[reportIdx + 1] : null;

  try {
    console.log(`Scanning drive ${driveId} folder ${folderId || 'root'} for file inventory...`);
    const households = await sp.scanInventory(driveId, folderId);

    const totalFiles = households.reduce((sum, h) => sum + h.totalFiles, 0);
    const totalSize = households.reduce((sum, h) => sum + (h.totalSize || 0), 0);

    // Generate report if --report flag provided
    if (reportPath) {
      const report = require('./report');
      report.generateReport('inventory', households, reportPath);
      console.log(`Report generated: ${reportPath}`);
    }

    output({
      success: true,
      drive_id: driveId,
      folder_id: folderId || 'root',
      households: households.length,
      total_files: totalFiles,
      total_size: totalSize,
      report_path: reportPath || null,
      data: households
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdGenerateReport(type, args) {
  if (!type) fail('Usage: cli.js generate-report inventory --output-file <path>');

  const report = require('./report');

  // Parse --output-file and --data-file from args
  let outputFile = null;
  let dataFile = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output-file' && args[i + 1]) outputFile = args[i + 1];
    if (args[i] === '--data-file' && args[i + 1]) dataFile = args[i + 1];
  }

  if (!outputFile) fail('--output-file is required');
  if (!dataFile) fail('--data-file is required (JSON file with scan data)');

  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const firmName = data.firm_name || null;
    report.generateReport(type, data.data || data, outputFile, firmName);

    output({
      success: true,
      type,
      output_file: outputFile,
      message: `Report generated: ${outputFile}`
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdSaveConfig(skill, jsonStr) {
  if (!skill || !jsonStr) fail('Usage: cli.js save-config <skill_name> \'{"key": "value"}\'');

  const api = require('./lea-skills-api');

  let config;
  try {
    config = JSON.parse(jsonStr);
  } catch (e) {
    fail(`Invalid JSON: ${e.message}`);
  }

  try {
    const result = await api.saveConfig(skill, config);
    output({ success: true, skill_name: skill, config: result.config });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdLoadConfig(skill) {
  if (!skill) fail('Usage: cli.js load-config <skill_name>');

  const api = require('./lea-skills-api');

  try {
    const result = await api.loadConfig(skill);
    output({ success: true, skill_name: skill, config: result.config });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdLogUsage(skill) {
  if (!skill) fail('Usage: cli.js log-usage <skill_name>');

  const api = require('./lea-skills-api');

  try {
    const result = await api.logUsage(skill);
    output({ success: true, skill_name: skill, total_runs: result.total_runs });
  } catch (err) {
    fail(err.message);
  }
}

// ── Dispatcher ──────────────────────────────────────────────

const [,, command, ...args] = process.argv;

const commands = {
  'check-setup': () => cmdCheckSetup(),
  'register': () => cmdRegister(args[0], args[1]),
  'auth-sharepoint': () => cmdAuthSharePoint(),
  'poll-sharepoint': () => cmdPollSharePoint(args[0]),
  'poll-sharepoint-wait': () => cmdPollSharePointWait(args[0]),
  'verify-sharepoint': () => cmdVerifySharePoint(),
  'list-sites': () => cmdListSites(),
  'list-libraries': () => cmdListLibraries(args[0]),
  'list-folders': () => cmdListFolders(args[0], args[1]),
  'scan-inventory': () => cmdScanInventory(args[0], args[1]),
  'generate-report': () => cmdGenerateReport(args[0], args.slice(1)),
  'save-config': () => cmdSaveConfig(args[0], args[1]),
  'load-config': () => cmdLoadConfig(args[0]),
  'log-usage': () => cmdLogUsage(args[0])
};

if (!command || !commands[command]) {
  console.log('SharePoint Client File Inventory CLI');
  console.log('');
  console.log('Commands:');
  console.log('  check-setup                           Check registration and connection status');
  console.log('  register <email> [firm]                Register with LEA Skills API');
  console.log('  auth-sharepoint                        Get SharePoint OAuth URL');
  console.log('  poll-sharepoint <session_id>           Poll for SharePoint OAuth completion (single)');
  console.log('  poll-sharepoint-wait <session_id>      Poll for SharePoint OAuth completion (wait up to 2 min)');
  console.log('  verify-sharepoint                      Verify SharePoint connection');
  console.log('  list-sites                             List SharePoint sites');
  console.log('  list-libraries <site_id>               List document libraries in a site');
  console.log('  list-folders <drive_id> [item_id]      List folder contents');
  console.log('  scan-inventory <drive_id> <folder_id>  Scan folders, catalog files by type');
  console.log('  generate-report inventory --output-file <path> --data-file <path>');
  console.log('  save-config <skill> \'<json>\'           Save skill config');
  console.log('  load-config <skill>                    Load skill config');
  console.log('  log-usage <skill>                      Log skill run');
  process.exit(command ? 1 : 0);
}

commands[command]().catch(err => {
  fail(err.message);
});
