---
description: Practifi Agreement Compliance - Cross-reference your CRM households with vault agreements to find compliance gaps
---

# Practifi Agreement Compliance

You are running the Practifi Agreement Compliance skill. It pulls households from Practifi (Salesforce), scans a document vault (Box, SharePoint, or Egnyte) for client agreements, and generates a compliance gap report showing which households are missing required agreements.

**CRITICAL: Never use `cd` in bash commands. All CLI commands use the absolute path prefix shown below.**

**CLI tool:** `node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js <command>` -- all commands output JSON to stdout

`${CLAUDE_SKILL_DIR}` is automatically set to this skill's directory. The plugin root is two levels up.

---

## Step 0: Silent Housekeeping

Run silently (do not display output). Ignore errors.

```bash
git -C ${CLAUDE_SKILL_DIR}/../.. pull --ff-only 2>/dev/null || true
```

```bash
npm install --prefix ${CLAUDE_SKILL_DIR}/../../scripts 2>/dev/null || true
```

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js check-setup 2>/dev/null
```

Parse the JSON. Store `registered`, `practifi_connected`, `box_connected`, `sharepoint_connected`, `egnyte_connected`.

Routing:
- If `registered` AND `practifi_connected` -> skip to Step 3
- If `registered` but NOT `practifi_connected` -> skip to Step 2
- If NOT `registered` -> Step 1

---

## Step 1: Welcome + Registration

Display:

```
 ____                 _   _  __ _
|  _ \ _ __ __ _  ___| |_(_)/ _(_)
| |_) | '__/ _` |/ __| __| | |_| |
|  __/| | | (_| | (__| |_| |  _| |
|_|   |_|  \__,_|\___|\__|_|_| |_|
    _                                          _
   / \   __ _ _ __ ___  ___ _ __ ___   ___ _ __ | |_
  / _ \ / _` | '__/ _ \/ _ \ '_ ` _ \ / _ \ '_ \| __|
 / ___ \ (_| | | |  __/  __/ | | | | |  __/ | | | |_
/_/   \_\__, |_|  \___|\___|_| |_| |_|\___|_| |_|\__|
        |___/
  ____                      _ _
 / ___|___  _ __ ___  _ __ | (_) __ _ _ __   ___ ___
| |   / _ \| '_ ` _ \| '_ \| | |/ _` | '_ \ / __/ _ \
| |__| (_) | | | | | | |_) | | | (_| | | | | (_|  __/
 \____\___/|_| |_| |_| .__/|_|_|\__,_|_| |_|\___\___|
                      |_|
```

| | |
|---|---|
| **What** | Pulls your household list from Practifi (Salesforce), scans your document vault for client agreements (CEAs, IMAs, IPSs), and generates a compliance gap report showing which households have agreements on file and which are missing them. |
| **Who** | Compliance officers, operations teams, and advisors at RIAs and wealth management firms using Practifi with Box, SharePoint, or Egnyte. |
| **How** | Connects to Practifi via Salesforce OAuth and to your vault via OAuth. Matches household names to vault folders, scans for agreement files, and cross-references the results. |

> Your data stays between you and your systems. LEA encrypts credentials locally and never uses your data for AI training.

Prompt for email (plain text, NOT AskUserQuestion):

> Enter your **work email** (registers you with LEA Skills):

Store as `email`.

> **Firm name** (optional, press Enter to skip):

Store as `firm_name`.

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js register "<email>" "<firm_name>"
```

(Omit firm_name arg if empty.)

If `success: true`, show "Registered successfully." and proceed to Step 2.

---

## Step 2: Connect to Practifi

Display:

> To connect to Practifi, you'll authorize via Salesforce OAuth. This opens a browser window where you log in to your Salesforce org.

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js auth-practifi
```

Parse JSON. Open `auth_url` in browser:

```bash
open "<auth_url>"
```

> A browser window has opened. Please log in to your Salesforce org and authorize the connection.

Then poll:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js poll-practifi-wait "<session_id>"
```

If `success: true` and `status: connected`:

Verify:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js verify-practifi
```

> Connected to Practifi as **{user.name}** ({user.email})

Proceed to Step 3.

If `success: false`, show error. AskUserQuestion: "Try again" / "Exit".

---

## Step 3: Select Document Vault

Use **AskUserQuestion**: "Which document vault does your firm use?"
- "Box" (description: "Box.com cloud storage")
- "SharePoint" (description: "Microsoft SharePoint / OneDrive")
- "Egnyte" (description: "Egnyte cloud file server")

Store the selection as `vault_platform` ("box", "sharepoint", or "egnyte").

---

## Step 4: Connect to Vault

Check the setup data from Step 0. If the selected vault is already connected (e.g., `box_connected: true`), skip to Step 5.

### If Box:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js auth-box
```

Parse JSON. Open `auth_url` in browser:

```bash
open "<auth_url>"
```

Then poll:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js poll-box-wait "<session_id>"
```

Verify:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js verify-box
```

Show: "Connected to Box as **{user.name}** ({user.login})"

### If SharePoint:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js auth-sharepoint
```

Parse JSON. Open `auth_url` in browser:

```bash
open "<auth_url>"
```

Then poll:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js poll-sharepoint-wait "<session_id>"
```

Verify:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js verify-sharepoint
```

Show: "Connected to SharePoint as **{user.name}** ({user.email})"

### If Egnyte:

First ask for domain (plain text prompt, NOT AskUserQuestion):

> Enter your **Egnyte domain** (e.g., if your URL is acmecorp.egnyte.com, enter **acmecorp**):

Store as `egnyte_domain`.

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js auth-egnyte "<egnyte_domain>"
```

Parse JSON. Open `auth_url` in browser:

```bash
open "<auth_url>"
```

Then poll:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js poll-egnyte-wait "<session_id>"
```

Verify:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js verify-egnyte
```

Show: "Connected to Egnyte as **{user.name}** ({user.email})"

---

## Step 5: Select Root Folder

The user needs to point to the root folder that contains their client/household folders.

### If Box:

List root folders:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-folders box 0
```

Show folder names (never IDs) via **AskUserQuestion**. Let user drill down if needed. Store the selected `folder_id`.

### If SharePoint:

First list sites:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-sites
```

AskUserQuestion with site names. Store `site_id`.

Then list drives:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-drives "<site_id>"
```

AskUserQuestion with drive names. Store `drive_id`.

Then list root folders:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-folders sharepoint root "<drive_id>"
```

AskUserQuestion with folder names. Let user drill down. Store `folder_id`.

### If Egnyte:

List root:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-folders egnyte /Shared
```

AskUserQuestion with folder names. Let user drill down. Store the full `folder_path`.

---

## Step 6: Run Compliance Scan

Display:

> Pulling households from Practifi and scanning your vault for agreements. This may take a few minutes for larger vaults...

### If Box:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js scan-compliance box "<folder_id>"
```

### If SharePoint:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js scan-compliance sharepoint "<folder_id>" "<drive_id>"
```

### If Egnyte:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js scan-compliance egnyte "<folder_path>"
```

**IMPORTANT:** This command may take several minutes for large vaults. Do NOT set a short timeout. Use at least 300000ms (5 minutes).

Parse JSON. If `success: false`, show error and offer retry.

If `success: true`:

1. Save the full JSON to a temp file:

```bash
echo '<full_json>' > /tmp/pf-compliance-data.json
```

2. Generate report:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js generate-report compliance --output-file /tmp/practifi-agreement-compliance-report.html --data-file /tmp/pf-compliance-data.json
```

3. Open in browser:

```bash
open /tmp/practifi-agreement-compliance-report.html
```

4. Show summary:

> **Compliance scan complete.** Report opened in your browser.
>
> - **{totalMatched}** of **{totalPfHouseholds}** Practifi households matched to vault folders
> - **{withAllAgreements}** fully compliant (CEA + IMA + IPS on file)
> - **{missingAny}** with agreement gaps
> - **{totalUnmatchedPf}** Practifi households with no vault match

---

## Step 7: Done

Log usage silently:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js log-usage practifi-agreement-compliance 2>/dev/null
```

Display:

> **Done!** Got questions? Want more? claude-skills@getlea.io

Use **AskUserQuestion**: "What next?"
- "Run again" (description: "Scan a different folder or re-run") -> Go to Step 5
- "Done" (description: "Exit")

---

## Error Handling

- If `success: false` in any CLI response, show the error and offer retry or exit
- If Practifi auth fails, suggest re-running the skill to re-authorize
- If vault auth fails, suggest re-running to re-authorize
- Rate limit errors (429): tell user to wait a moment
- Empty results: "No households found in Practifi" or "No folders found in vault" (graceful, not error)
- Parse JSON from stdout only (logs go to stderr)
- For scan-compliance, use a long timeout (5+ minutes)

## Bash Call Summary

| Step | Command | When |
|------|---------|------|
| 0 | `npm install` | Always (silent) |
| 0 | `check-setup` | Always |
| 1 | `register` | First run only |
| 2 | `auth-practifi` | First run only |
| 2 | `poll-practifi-wait` | First run only |
| 2 | `verify-practifi` | Always |
| 3 | (user selection) | Always |
| 4 | `auth-{platform}` | First vault connection |
| 4 | `poll-{platform}-wait` | First vault connection |
| 4 | `verify-{platform}` | Always |
| 5 | `list-folders` / `list-sites` / `list-drives` | Folder selection |
| 6 | `scan-compliance` | Main scan |
| 6 | `generate-report` | Report |
| 6 | `open` | Open report |
| 7 | `log-usage` | Always (silent) |

**Total: 8-15 bash calls depending on platform and first-run status**
