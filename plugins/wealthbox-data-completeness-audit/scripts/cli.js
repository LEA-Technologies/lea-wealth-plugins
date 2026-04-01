#!/usr/bin/env node

/**
 * Wealthbox Data Completeness Audit CLI
 *
 * Usage:
 *   node cli.js check-setup
 *   node cli.js register <email> [firm_name]
 *   node cli.js auth-wealthbox-token <token>
 *   node cli.js verify-wealthbox
 *   node cli.js audit-contacts
 *   node cli.js generate-report audit --output-file <path> --data-file <path>
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
  const wb = require('./wealthbox-api');
  const setup = api.checkSetup();

  let wealthboxConnected = false;
  if (setup.registered) {
    try {
      wb.getToken();
      wealthboxConnected = true;
    } catch (e) {
      // Not connected
    }
  }

  output({
    success: true,
    registered: setup.registered,
    email: setup.email,
    customer_id: setup.customer_id,
    wealthbox_connected: wealthboxConnected
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

async function cmdAuthWealthboxToken(token) {
  if (!token) fail('Usage: cli.js auth-wealthbox-token <token>');

  const wb = require('./wealthbox-api');

  // Save the token locally
  wb.saveToken({
    access_token: token,
    auth_type: 'api_token',
    saved_at: new Date().toISOString()
  });

  // Verify it works
  try {
    const user = await wb.getCurrentUser();
    output({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        plan: user.plan
      },
      message: 'Wealthbox connected successfully.'
    });
  } catch (err) {
    // Clear the bad token
    wb.saveToken({});
    fail(`Token verification failed: ${err.message}`);
  }
}

async function cmdVerifyWealthbox() {
  const wb = require('./wealthbox-api');

  try {
    const user = await wb.getCurrentUser();
    output({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        plan: user.plan
      }
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdAuditContacts() {
  const wb = require('./wealthbox-api');

  try {
    console.log('Pulling contacts from Wealthbox...');
    const contacts = await wb.getAllContacts();

    if (contacts.length === 0) {
      output({
        success: true,
        totalContacts: 0,
        message: 'No contacts found in your Wealthbox account.'
      });
      return;
    }

    console.log(`Analyzing ${contacts.length} contacts...`);
    const audit = wb.auditContacts(contacts);

    output({
      success: true,
      ...audit
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdGenerateReport(type, extraArgs) {
  if (!type) fail('Usage: cli.js generate-report audit --output-file <path> --data-file <path>');

  const report = require('./report');

  let outputFile = null;
  let dataFile = null;
  for (let i = 0; i < extraArgs.length; i++) {
    if (extraArgs[i] === '--output-file' && extraArgs[i + 1]) outputFile = extraArgs[i + 1];
    if (extraArgs[i] === '--data-file' && extraArgs[i + 1]) dataFile = extraArgs[i + 1];
  }

  if (!outputFile) fail('--output-file is required');
  if (!dataFile) fail('--data-file is required (JSON file with audit data)');

  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const firmName = data.firm_name || null;
    report.generateReport(type, data, outputFile, firmName);

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
  'auth-wealthbox-token': () => cmdAuthWealthboxToken(args[0]),
  'verify-wealthbox': () => cmdVerifyWealthbox(),
  'audit-contacts': () => cmdAuditContacts(),
  'generate-report': () => cmdGenerateReport(args[0], args.slice(1)),
  'save-config': () => cmdSaveConfig(args[0], args[1]),
  'load-config': () => cmdLoadConfig(args[0]),
  'log-usage': () => cmdLogUsage(args[0])
};

if (!command || !commands[command]) {
  console.log('Wealthbox Data Completeness Audit CLI');
  console.log('');
  console.log('Commands:');
  console.log('  check-setup                          Check registration and connection status');
  console.log('  register <email> [firm]               Register with LEA Skills API');
  console.log('  auth-wealthbox-token <token>           Connect using Wealthbox API token');
  console.log('  verify-wealthbox                      Verify Wealthbox connection');
  console.log('  audit-contacts                        Pull and analyze all contacts');
  console.log('  generate-report audit --output-file <path> --data-file <path>');
  console.log('  save-config <skill> \'<json>\'          Save skill config');
  console.log('  load-config <skill>                   Load skill config');
  console.log('  log-usage <skill>                     Log skill run');
  process.exit(command ? 1 : 0);
}

commands[command]().catch(err => {
  fail(err.message);
});
