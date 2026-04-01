---
description: Egnyte File Inventory Report — Take inventory of files across your Egnyte vault and generate an organized report
---

# Egnyte File Inventory Report

You are running the Egnyte File Inventory skill — it scans an Egnyte folder, catalogs every file per household folder with document category tagging, and generates an HTML report.

**CRITICAL: Never use `cd` in bash commands. All CLI commands use the absolute path prefix shown below.**

**CLI tool:** `node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js <command>` — all commands output JSON to stdout

`${CLAUDE_SKILL_DIR}` is automatically set to this skill's directory. The plugin root is two levels up.

---

## Step 0: Silent Housekeeping

Run these commands silently (do not display output to user). **Ignore any errors — these are best-effort and must never block the flow.**

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

Parse the JSON. Store `registered`, `email`, `egnyte_connected` for routing.

- If `registered` AND `egnyte_connected` → skip to Step 3
- If `registered` but NOT `egnyte_connected` → skip to Step 2
- If NOT `registered` → proceed to Step 1

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

**Egnyte File Inventory Report** — A LEA Skill

**What does it do?**
Takes inventory of your Egnyte vault — every file across all client and household folders, organized by document type (agreements, tax docs, statements, and more). Generates an HTML report you can open in your browser with one click.

**Who is this for?**
Wealth management firms that store client documents in Egnyte and want a clear picture of what's in their vault — file counts, document categories, and which households have gaps.

**How it works:**

| Step | What happens |
|------|-------------|
| **Connect** | Securely link your Egnyte account via OAuth |
| **Pick location** | Choose which folder contains your client folders |
| **Inventory** | Catalog every file and tag it by document type |
| **Report** | Generate an HTML report with stats, categories, and CSV export |

> Credentials stored encrypted on LEA servers. All scanning runs locally — your files flow directly between your machine and Egnyte, never through LEA.

---

Use **AskUserQuestion**: "Ready to get started?"
- "Let's go" (description: "Register and connect Egnyte")
- "Not now" (description: "Exit")

If "Not now", stop.

### Registration

**IMPORTANT: Do NOT use AskUserQuestion for email or firm name. Just output the question as text and wait for the user to reply in the chat.**

Output: "What's your work email?" — then STOP and wait for the user to type their email in the chat.

After they reply with their email, output: "And your firm name? (or just hit enter to skip)" — then STOP and wait again.

Run registration with whatever they provided:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js register "USER_EMAIL" "FIRM_NAME" 2>/dev/null
```

If the response includes `"returning": true`, the user was already registered — display: "Welcome back! Token refreshed."

Otherwise display: "Registered! Now let's connect your Egnyte account."

---

## Step 2: Egnyte Connection (first run only)

### 2a: Get Egnyte domain

**IMPORTANT: Do NOT use AskUserQuestion for the domain. Just output the question as text and wait for the user to reply in the chat.**

Output: "What's your Egnyte domain? (The part before .egnyte.com — for example, if you go to **acmecorp**.egnyte.com, your domain is **acmecorp**)" — then STOP and wait for the user to type their domain.

Clean the domain: strip any `.egnyte.com` suffix, lowercase, remove non-alphanumeric/hyphen characters.

### 2b: Authorize via OAuth

Get the OAuth URL (pass the domain):

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js auth-egnyte DOMAIN 2>/dev/null
```

Parse the JSON. Extract `auth_url` and `session_id`.

Display exactly this:

> **Now let's connect your Egnyte account.**
>
> I'll open an Egnyte sign-in page. Sign in with your work account and approve access.

Open the auth URL in the browser automatically:

```bash
open "AUTH_URL"
```

Display exactly this:

> Sign in and approve access in the browser tab that just opened, then come back here.

Wait for OAuth completion (polls automatically for up to 2 minutes):

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js poll-egnyte-wait SESSION_ID 2>/dev/null
```

- If `status` is `"connected"` → proceed to Step 3
- If `status` is `"failed"`, `"expired"`, or `"timeout"` → show the error and ask to retry.

Display: "Egnyte connected!"

---

## Step 3: Verify Connection

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js verify-egnyte 2>/dev/null
```

Parse JSON. Show:

> **Egnyte Connected**
> Logged in as: **FIRST_NAME LAST_NAME** (EMAIL)

---

## Step 4: Choose Folder

### 4a: Try loading saved config

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js load-config egnyte-file-inventory 2>/dev/null
```

If config exists and has `folder_path` and `folder_name`:

Display:

> **Previously used location:**
> Folder: **FOLDER_NAME** (`FOLDER_PATH`)

Use **AskUserQuestion**: "Use this location again?"
- "Yes, use saved location" (description: "Scan the same folder as last time")
- "Pick a different location" (description: "Choose a new folder")

If "Yes", skip to Step 5 using the saved `folder_path`.

### 4b: Browse folders

Start at `/Shared`:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-folders /Shared 2>/dev/null
```

Display folders as a numbered list (folder names only, never show full paths to the user):

> **Folders in /Shared:**
>
> 1. Folder Name A
> 2. Folder Name B
> 3. ...

Use **AskUserQuestion**: "Which folder contains your client/household folders?"
- List the first 4 folder names as options (or fewer if there are fewer)
- User can also type a folder name in "Other"

**Important: Internally map the user's selection back to the folder path from the JSON response. Never display full paths unless asked.**

### 4c: Confirm folder

List the contents of the selected folder:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-folders SELECTED_PATH 2>/dev/null
```

Show the subfolders:

> **Folders inside "SELECTED_FOLDER_NAME":**
>
> (list first ~10 subfolder names)
>
> These look like your client/household folders.

Use **AskUserQuestion**: "Ready to take inventory of this folder?"
- "Yes, take inventory" (description: "Inventory all files across these household folders")
- "Go back" (description: "Pick a different folder")
- "Go deeper" (description: "Look inside one of these folders first")

If "Go back" → repeat folder selection at parent. If "Go deeper" → ask which subfolder, list it, repeat.

### 4d: Save config

After confirming the folder, save the location for next time:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js save-config egnyte-file-inventory '{"folder_path": "FOLDER_PATH", "folder_name": "FOLDER_NAME"}' 2>/dev/null
```

---

## Step 5: Take Inventory + Report

Display exactly this:

> **Taking inventory of all files in "FOLDER_NAME"...**
> This takes around 30 seconds, depending on how many files you have.

Run a single command that inventories and generates the HTML report:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js scan-inventory FOLDER_PATH --report ${CLAUDE_SKILL_DIR}/../../scripts/inventory-report.html 2>/dev/null
```

**Do NOT show a summary table. Do NOT show stats, metrics, or file counts.** The report has all of this. Just open the report immediately.

Open the HTML report in the browser:

```bash
open "${CLAUDE_SKILL_DIR}/../../scripts/inventory-report.html"
```

Display exactly this:

> **Your File Inventory Report is open in your browser.**
>
> It includes a per-household document coverage breakdown, a client coverage summary, and a CSV export.

---

## Step 7: Done

Log usage (silently, do not display output):

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js log-usage egnyte-file-inventory 2>/dev/null
```

Display exactly this:

> **Done!** Got questions? Want more? claude-skills@getlea.io

Use **AskUserQuestion**: "What next?"
- "Inventory another folder" (description: "Run on a different folder") → Go to Step 4b
- "Done" (description: "Exit")

---

## Error Handling

- If `success: false` in any CLI response, show the error message and ask to retry or exit
- If Egnyte auth fails or token is expired, suggest re-running the skill to re-authorize
- Parse JSON from stdout only (logs go to stderr via `2>/dev/null`)

## Bash Call Summary

| Step | Command | When |
|------|---------|------|
| 0 | `git pull` | Always (silent) |
| 0 | `npm install` | Always (silent) |
| 0 | `check-setup` | Always |
| 1 | `register` | First run only |
| 2a | (no CLI) | Ask for domain |
| 2b | `auth-egnyte` | First run only |
| 2b | `open` | First run only (OAuth URL) |
| 2b | `poll-egnyte-wait` | First run only |
| 3 | `verify-egnyte` | Always |
| 4 | `load-config` | Check saved location |
| 4 | `list-folders` | Folder selection (1-3 calls) |
| 4 | `save-config` | Save chosen location |
| 5 | `scan-inventory` | Main inventory |
| 5 | `open` | Open report |
| 7 | `log-usage` | Usage tracking |

**Total: 7-12 bash calls for full flow**
