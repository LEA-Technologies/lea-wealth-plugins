---
description: Wealthbox Data Completeness Audit -- Scan your Wealthbox CRM for missing and incomplete contact data
---

# Wealthbox Data Completeness Audit

You are running the Wealthbox Data Completeness Audit skill. It pulls all contacts from a Wealthbox CRM account, analyzes field completeness, scores each contact, and generates an interactive HTML report.

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

Parse the JSON. Store `registered`, `email`, `wealthbox_connected` for routing.

- If `registered` AND `wealthbox_connected` -> skip to Step 3
- If `registered` but NOT `wealthbox_connected` -> skip to Step 2
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

**Wealthbox Data Completeness Audit** -- A LEA Skill

**What does it do?**
Scans your Wealthbox CRM and generates a report showing which contact records are missing critical information: email, phone, date of birth, household assignment, agreement dates, and more.

**Who is this for?**
Operations teams, compliance officers, and advisors at RIAs and wealth management firms who use Wealthbox.

**How it works:**

| Step | What happens |
|------|-------------|
| **Connect** | Securely link your Wealthbox account via API token |
| **Audit** | Pull all contacts and analyze 14 completeness fields |
| **Report** | Generate an HTML report with scores, field coverage, and CSV export |

> Credentials stored encrypted on LEA servers. All analysis runs locally — your data flows directly between your machine and Wealthbox, never through LEA.

---

Use **AskUserQuestion**: "Ready to get started?"
- "Let's go" (description: "Register and connect Wealthbox")
- "Not now" (description: "Exit")

If "Not now", exit. If "Let's go", continue:

Prompt for email and firm name. Use plain text prompts, **NOT AskUserQuestion** (free-text input is better here):

> To get started, enter your **work email** (this registers you with LEA Skills):

Wait for user input. Store as `email`.

> And your **firm name** (optional, press Enter to skip):

Wait for user input. Store as `firm_name` (may be empty).

Run registration:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js register "<email>" "<firm_name>"
```

If `firm_name` is empty, omit it:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js register "<email>"
```

Parse JSON. If `success: true`, show: "Registered successfully." and proceed to Step 2.

---

## Step 2: Connect to Wealthbox

Display:

> To connect, you will need your **Wealthbox API Access Token**. Here is how to get it:
>
> 1. Log in to Wealthbox at **app.crmworkspace.com**
> 2. Click your profile icon (top right) and select **Settings**
> 3. Scroll to **API Access** and click **Create Access Token**
> 4. Copy the token

Then prompt:

> Paste your **Wealthbox API token** here:

Wait for user input. Store as `wb_token`.

Run auth:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js auth-wealthbox-token "<wb_token>"
```

Parse JSON response.

If `success: true`, display:

> Connected to Wealthbox as **{user.name}** ({user.email})

Proceed to Step 3.

If `success: false`, display the error and suggest:

> Could not connect. Please check that your API token is correct and try again.

Use **AskUserQuestion**: "What would you like to do?"
- "Try again" (description: "Enter a different token") -> Go back to token prompt
- "Exit" (description: "Close the skill")

---

## Step 3: Verify Connection

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js verify-wealthbox
```

Parse JSON. If `success: true`, display:

> Connected to Wealthbox as **{user.name}** ({user.email})

If `success: false`, display error and suggest re-running the skill to reconnect.

---

## Step 4: Run Audit

Display:

> Pulling contacts from Wealthbox and analyzing data completeness. This may take a moment for larger accounts...

Run the audit:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js audit-contacts
```

**IMPORTANT:** This command may take 10-30 seconds for accounts with many contacts due to API rate limits. Do NOT set a short timeout.

Parse the JSON response. If `success: false`, show the error and offer to retry.

If `success: true` but `totalContacts: 0`, display:

> No contacts found in your Wealthbox account.

And skip to Step 7.

If `success: true` and contacts exist:

1. Save the full JSON response to a temp file:

```bash
echo '<full_json_response>' > /tmp/wb-audit-data.json
```

2. Generate the HTML report:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js generate-report audit --output-file /tmp/wealthbox-data-completeness-report.html --data-file /tmp/wb-audit-data.json
```

3. Open the report in the browser:

```bash
open /tmp/wealthbox-data-completeness-report.html
```

4. Display a brief summary (the report has all the details):

> **Audit complete.** Report opened in your browser.
>
> - **{totalContacts}** contacts audited
> - **{averageScore}%** average completeness score
> - **{needsAttention}** contacts need attention (below 50%)

Do NOT show a detailed table or field breakdown here. The report has everything.

---

## Step 7: Done

Log usage (silently, do not display output):

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js log-usage wealthbox-data-completeness 2>/dev/null
```

Use **AskUserQuestion**: "What next?"
- "Run again" (description: "Re-run the audit with fresh data") -> Go to Step 4
- "Done" (description: "Exit")

If the user selects "Done", display exactly this and end:

> **Done!** Got questions? Want more? claude-skills@getlea.io

---

## Error Handling

- If `success: false` in any CLI response, show the error message and ask to retry or exit
- If Wealthbox auth fails or token is invalid, suggest re-running the skill to reconnect
- If you get a rate limit error (429), tell the user to wait a moment and try again
- Parse JSON from stdout only (logs go to stderr via `2>/dev/null`)
- If the audit-contacts command times out, increase the timeout and retry (large accounts may take 30+ seconds)

## Bash Call Summary

| Step | Command | When |
|------|---------|------|
| 0 | `npm install` | Always (silent) |
| 0 | `check-setup` | Always |
| 1 | `register` | First run only |
| 2 | `auth-wealthbox-token` | First run only |
| 3 | `verify-wealthbox` | Always |
| 4 | `audit-contacts` | Main audit |
| 4 | `generate-report` | Report generation |
| 4 | `open` | Open report |
| 7 | `log-usage` | Usage tracking |

**Total: 5-8 bash calls for full flow**
