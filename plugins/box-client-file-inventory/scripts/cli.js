#!/usr/bin/env node

/**
 * Box Client File Inventory CLI — JSON-outputting command dispatcher
 *
 * Usage:
 *   node cli.js check-setup
 *   node cli.js register <email> [firm_name]
 *   node cli.js auth-box
 *   node cli.js poll-box <session_id>
 *   node cli.js poll-box-wait <session_id>
 *   node cli.js verify-box
 *   node cli.js list-folders [folder_id]
 *   node cli.js scan-inventory <folder_id>
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

  let boxConnected = false;
  if (setup.registered) {
    try {
      await api.getBoxCredentials();
      boxConnected = true;
    } catch (e) {
      // Not connected
    }
  }

  output({
    success: true,
    registered: setup.registered,
    email: setup.email,
    customer_id: setup.customer_id,
    box_connected: boxConnected
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

async function cmdAuthBox() {
  const api = require('./lea-skills-api');

  try {
    const result = await api.getBoxAuthUrl();
    output({
      success: true,
      auth_url: result.auth_url,
      session_id: result.session_id
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdPollBox(sessionId) {
  if (!sessionId) fail('Usage: cli.js poll-box <session_id>');

  const api = require('./lea-skills-api');

  try {
    const result = await api.pollBoxStatus(sessionId);
    output({ success: true, status: result.status });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdPollBoxWait(sessionId) {
  if (!sessionId) fail('Usage: cli.js poll-box-wait <session_id>');

  const api = require('./lea-skills-api');
  const maxAttempts = 24; // 24 × 5s = 2 minutes

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await api.pollBoxStatus(sessionId);
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

async function cmdVerifyBox() {
  const box = require('./box-api');

  try {
    const user = await box.getCurrentUser();
    output({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        login: user.login,
        space_amount: user.space_amount,
        space_used: user.space_used
      }
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdListFolders(folderId) {
  const box = require('./box-api');

  try {
    const result = await box.listFolder(folderId || '0');
    const entries = result.entries.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      size: e.size || null,
      modified_at: e.modified_at || null
    }));

    output({ success: true, folder_id: folderId || '0', entries });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdScanInventory(folderId) {
  if (!folderId) fail('Usage: cli.js scan-inventory <folder_id> [--report <path>]');

  const box = require('./box-api');

  // Parse --report flag
  const reportIdx = args.indexOf('--report');
  const reportPath = reportIdx !== -1 ? args[reportIdx + 1] : null;

  try {
    console.log(`Scanning folder ${folderId} for file inventory...`);
    const households = await box.scanInventory(folderId);

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
      folder_id: folderId,
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
  'auth-box': () => cmdAuthBox(),
  'poll-box': () => cmdPollBox(args[0]),
  'poll-box-wait': () => cmdPollBoxWait(args[0]),
  'verify-box': () => cmdVerifyBox(),
  'list-folders': () => cmdListFolders(args[0]),
  'scan-inventory': () => cmdScanInventory(args[0]),
  'generate-report': () => cmdGenerateReport(args[0], args.slice(1)),
  'save-config': () => cmdSaveConfig(args[0], args[1]),
  'load-config': () => cmdLoadConfig(args[0]),
  'log-usage': () => cmdLogUsage(args[0])
};

if (!command || !commands[command]) {
  console.log('Box Client File Inventory CLI');
  console.log('');
  console.log('Commands:');
  console.log('  check-setup                     Check registration and connection status');
  console.log('  register <email> [firm]          Register with LEA Skills API');
  console.log('  auth-box                         Get Box OAuth URL');
  console.log('  poll-box <session_id>            Poll for Box OAuth completion (single)');
  console.log('  poll-box-wait <session_id>       Poll for Box OAuth completion (wait up to 2 min)');
  console.log('  verify-box                       Verify Box connection');
  console.log('  list-folders [folder_id]         List Box folder contents');
  console.log('  scan-inventory <folder_id>       Scan folders, catalog files by type');
  console.log('  generate-report inventory --output-file <path> --data-file <path>');
  console.log('  save-config <skill> \'<json>\'     Save skill config');
  console.log('  load-config <skill>              Load skill config');
  console.log('  log-usage <skill>                Log skill run');
  process.exit(command ? 1 : 0);
}

commands[command]().catch(err => {
  fail(err.message);
});
