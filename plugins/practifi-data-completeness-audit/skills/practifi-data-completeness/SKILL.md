---
description: Practifi Data Completeness Audit -- Scan your Practifi CRM for missing and incomplete contact data
---

# Practifi Data Completeness Audit

You are running the Practifi Data Completeness Audit skill. It connects to a Practifi (Salesforce) CRM account via OAuth, discovers available fields, pulls all contacts, analyzes field completeness, and generates an interactive HTML report.

**CRITICAL: Never use `cd` in bash commands. All CLI commands use the absolute path prefix shown below.**

**CLI tool:** `node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js <command>` -- all commands output JSON to stdout

`${CLAUDE_SKILL_DIR}` is automatically set to this skill's directory. The plugin root is two levels up.

---

## Step 0: Silent Housekeeping

Run these commands silently (do not display output to user). **Ignore any errors. These are best-effort and must never block the flow.**

```bash
git -C ${CLAUDE_SKILL_DIR}/../.. pull --ff-only 2>/dev/null || true
```

```bash
npm install --prefix ${CLAUDE_SKILL_DIR}/../../scripts 2>/dev/null || true
```

Then check setup status:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js check-setup 2>/dev/null
```

Parse the JSON. Store `registered`, `email`, `practifi_connected` for routing.

- If `registered` AND `practifi_connected` -> skip to Step 3
- If `registered` but NOT `practifi_connected` -> skip to Step 2
- If NOT `registered` -> proceed to Step 1

---

## Step 1: Welcome + Registration (first run only)

Display:

---

```
 ██╗     ███████╗ █████╗
 ██║     ██╔════╝██╔══██╗
 ██║     █████╗  ███████║
 ██║     ██╔══╝  ██╔══██║
 ███████╗███████╗██║  ██║
 ╚══════╝╚══════╝╚═╝  ╚═╝
```

**Practifi Data Completeness Audit** -- A LEA Skill

**What does it do?**
Scans your Practifi CRM and generates a report showing which contact records are missing critical information: email, phone, SSN, date of birth, citizenship status, household assignment, and more.

**Who is this for?**
Operations teams, compliance officers, and advisors at RIAs and wealth management firms who use Practifi.

**How it works:**

| Step | What happens |
|------|-------------|
| **Connect** | Securely link your Practifi account via Salesforce OAuth |
| **Discover** | Detect which Practifi custom fields exist in your org |
| **Audit** | Pull all contacts and analyze completeness across 14 fields |
| **Report** | Generate an HTML report with scores, field coverage, and CSV export |

> Your Practifi credentials are encrypted and stored on LEA's infrastructure. All data analysis runs locally on your machine -- LEA never accesses or stores your CRM data.

---

Use **AskUserQuestion**: "Ready to get started?"
- "Let's go" (description: "Register and connect Practifi")
- "Not now" (description: "Exit")

If "Not now", exit. If "Let's go", continue:

### Registration

**IMPORTANT: Do NOT use AskUserQuestion for email or firm name. Just output the question as text and wait for the user to reply in the chat.**

Output: "What's your work email?" -- then STOP and wait for the user to type their email in the chat.

After they reply with their email, output: "And your firm name? (or just hit enter to skip)" -- then STOP and wait again.

Run registration with whatever they provided:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js register "USER_EMAIL" "FIRM_NAME" 2>/dev/null
```

If `firm_name` is empty, omit it:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js register "USER_EMAIL" 2>/dev/null
```

If the response includes `"returning": true`, the user was already registered -- display: "Welcome back! Token refreshed."

Otherwise display: "Registered! Now let's connect your Practifi account."

---

## Step 2: Practifi Connection via Salesforce OAuth

Get the OAuth URL (no parameters needed -- Salesforce uses a universal login URL):

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js auth-practifi 2>/dev/null
```

Parse the JSON. Extract `auth_url` and `session_id`.

Display exactly this:

> **Now let's connect your Practifi account.**
>
> I'll open a Salesforce sign-in page. Sign in with your Practifi credentials and click Allow.

Open the auth URL in the browser automatically:

```bash
open "AUTH_URL"
```

Display exactly this:

> Sign in and click **Allow** in the browser tab that just opened, then come back here.

Wait for OAuth completion (polls automatically for up to 2 minutes):

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js poll-practifi-wait SESSION_ID 2>/dev/null
```

- If `status` is `"connected"` -> proceed to Step 3
- If `status` is `"failed"`, `"expired"`, or `"timeout"` -> show the error and ask to retry.

Display: "Practifi connected!"

---

## Step 3: Verify Connection

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js verify-practifi 2>/dev/null
```

Parse JSON. Show:

> **Practifi Connected**
> Logged in as: **NAME** (EMAIL)

---

## Step 4: Run Audit

Display:

> **Pulling contacts from Practifi and analyzing data completeness...**
> This discovers available fields, pulls all contacts, and scores each one. It may take a moment for larger accounts.

Run the full audit (discover fields + pull contacts + audit + generate report in one command):

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js pull-contacts --report ${CLAUDE_SKILL_DIR}/../../scripts/practifi-data-completeness-report.html 2>/dev/null
```

**IMPORTANT:** This command may take 15-60 seconds for accounts with many contacts. Do NOT set a short timeout. Use at least 120000ms (2 minutes).

Parse the JSON response. If `success: false`, show the error and offer to retry.

If `success: true` but `totalContacts: 0`, display:

> No contacts found in your Practifi account.

And skip to Step 5.

If `success: true` and contacts exist:

Open the HTML report in the browser:

```bash
open "${CLAUDE_SKILL_DIR}/../../scripts/practifi-data-completeness-report.html"
```

Display a brief summary (the report has all the details):

> **Audit complete.** Report opened in your browser.
>
> - **{totalContacts}** contacts audited across **{fieldsChecked}** fields
> - **{averageScore}%** average completeness score
> - **{needsAttention}** contacts need attention (below 50%)

If there are skipped fields, add:

> **Note:** {skippedFields.length} Practifi custom field(s) were not found in your org and were excluded from the audit.

Do NOT show a detailed table or field breakdown here. The report has everything.

---

## Step 5: Done

Log usage (silently, do not display output):

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js log-usage practifi-data-completeness 2>/dev/null
```

Use **AskUserQuestion**: "What next?"
- "Run again" (description: "Re-run the audit with fresh data") -> Go to Step 4
- "Done" (description: "Exit")

If the user selects "Done", display exactly this and end:

> **Done!** Got questions? Want more? claude-skills@getlea.io

---

## Error Handling

- If `success: false` in any CLI response, show the error message and ask to retry or exit
- If Practifi auth fails or token is expired, suggest re-running the skill to re-authorize
- Parse JSON from stdout only (logs go to stderr via `2>/dev/null`)
- If the pull-contacts command times out, increase the timeout and retry (large accounts may take 60+ seconds)

## Bash Call Summary

| Step | Command | When |
|------|---------|------|
| 0 | `git pull` | Always (silent) |
| 0 | `npm install` | Always (silent) |
| 0 | `check-setup` | Always |
| 1 | `register` | First run only |
| 2 | `auth-practifi` | First run only |
| 2 | `open` | First run only (OAuth URL) |
| 2 | `poll-practifi-wait` | First run only |
| 3 | `verify-practifi` | Always |
| 4 | `pull-contacts` | Main audit (includes field discovery) |
| 4 | `open` | Open report |
| 5 | `log-usage` | Usage tracking |

**Total: 5-9 bash calls for full flow**
