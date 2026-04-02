#!/usr/bin/env node

/**
 * Practifi Data Completeness Audit CLI — JSON-outputting command dispatcher
 *
 * Usage:
 *   node cli.js check-setup
 *   node cli.js register <email> [firm_name]
 *   node cli.js auth-practifi
 *   node cli.js poll-practifi <session_id>
 *   node cli.js poll-practifi-wait <session_id>
 *   node cli.js verify-practifi
 *   node cli.js discover-fields
 *   node cli.js pull-contacts [--report <path>]
 *   node cli.js generate-report --output-file <path> --data-file <path>
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

  let practifiConnected = false;
  if (setup.registered) {
    try {
      await api.getPractifiCredentials();
      practifiConnected = true;
    } catch (e) {
      // Not connected
    }
  }

  output({
    success: true,
    registered: setup.registered,
    email: setup.email,
    customer_id: setup.customer_id,
    practifi_connected: practifiConnected
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
      returning: result.returning || false,
      message: 'Registration successful. API token saved locally.'
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdAuthPractifi() {
  const api = require('./lea-skills-api');

  try {
    const result = await api.getPractifiAuthUrl();
    output({
      success: true,
      auth_url: result.auth_url,
      session_id: result.session_id
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdPollPractifi(sessionId) {
  if (!sessionId) fail('Usage: cli.js poll-practifi <session_id>');

  const api = require('./lea-skills-api');

  try {
    const result = await api.pollPractifiStatus(sessionId);
    output({ success: true, status: result.status });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdPollPractifiWait(sessionId) {
  if (!sessionId) fail('Usage: cli.js poll-practifi-wait <session_id>');

  const api = require('./lea-skills-api');
  const maxAttempts = 24; // 24 × 5s = 2 minutes

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await api.pollPractifiStatus(sessionId);
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

async function cmdVerifyPractifi() {
  const pf = require('./practifi-api');

  try {
    const user = await pf.getCurrentUser();
    output({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        organization_id: user.organization_id
      }
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdDiscoverFields() {
  const pf = require('./practifi-api');

  try {
    const discovery = await pf.discoverAvailableFields();
    output({
      success: true,
      available: discovery.available,
      skipped: discovery.skipped,
      total_available: discovery.available.length,
      total_skipped: discovery.skipped.length
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdPullContacts() {
  const pf = require('./practifi-api');

  // Parse --report flag
  const reportIdx = args.indexOf('--report');
  const reportPath = reportIdx !== -1 ? args[reportIdx + 1] : null;

  try {
    console.log('Discovering available fields...');
    const discovery = await pf.discoverAvailableFields();

    console.log(`Fields available: ${discovery.available.length}, skipped: ${discovery.skipped.length}`);
    console.log('Pulling contacts from Practifi...');
    const contacts = await pf.pullContacts(discovery);

    if (contacts.length === 0) {
      output({
        success: true,
        totalContacts: 0,
        message: 'No contacts found in your Practifi account.'
      });
      return;
    }

    console.log(`Auditing ${contacts.length} contacts...`);
    const audit = pf.auditContacts(contacts, discovery);

    // Generate report if --report flag provided
    if (reportPath) {
      const report = require('./report');
      report.generateReport('audit', audit, reportPath);
      console.log(`Report generated: ${reportPath}`);
    }

    output({
      success: true,
      ...audit,
      report_path: reportPath || null
    });
  } catch (err) {
    fail(err.message);
  }
}

async function cmdGenerateReport(extraArgs) {
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
    report.generateReport('audit', data, outputFile, firmName);

    output({
      success: true,
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

  if (typeof config !== 'object' || config === null) {
    fail('Expected JSON object');
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
  'auth-practifi': () => cmdAuthPractifi(),
  'poll-practifi': () => cmdPollPractifi(args[0]),
  'poll-practifi-wait': () => cmdPollPractifiWait(args[0]),
  'verify-practifi': () => cmdVerifyPractifi(),
  'discover-fields': () => cmdDiscoverFields(),
  'pull-contacts': () => cmdPullContacts(),
  'generate-report': () => cmdGenerateReport(args),
  'save-config': () => cmdSaveConfig(args[0], args[1]),
  'load-config': () => cmdLoadConfig(args[0]),
  'log-usage': () => cmdLogUsage(args[0])
};

if (!command || !commands[command]) {
  console.log('Practifi Data Completeness Audit CLI');
  console.log('');
  console.log('Commands:');
  console.log('  check-setup                          Check registration and connection status');
  console.log('  register <email> [firm]               Register with LEA Skills API');
  console.log('  auth-practifi                         Get Salesforce OAuth URL');
  console.log('  poll-practifi <session_id>            Poll for Practifi OAuth completion (single)');
  console.log('  poll-practifi-wait <session_id>       Poll for Practifi OAuth completion (wait up to 2 min)');
  console.log('  verify-practifi                       Verify Practifi connection');
  console.log('  discover-fields                       Discover available Practifi fields');
  console.log('  pull-contacts [--report <path>]       Discover + pull + audit + optional report');
  console.log('  generate-report --output-file <path> --data-file <path>');
  console.log('  save-config <skill> \'<json>\'          Save skill config');
  console.log('  load-config <skill>                   Load skill config');
  console.log('  log-usage <skill>                     Log skill run');
  process.exit(command ? 1 : 0);
}

commands[command]().catch(err => {
  fail(err.message);
});
