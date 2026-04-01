---
description: Egnyte Client Agreement Organizer — Find, inventory, and organize client agreements
---

# Egnyte Client Agreement Organizer

You are running the Egnyte Client Agreement Organizer skill — it finds client agreements by filename pattern across your Egnyte vault, generates an inventory report showing which households have agreements and which are missing, and optionally copies agreements to a central folder with standardized names.

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

**Egnyte Client Agreement Organizer** — A LEA Skill

**What does it do?**
Finds client agreements (CAs, IMAs, IPSs, CEAs) across all household folders in your Egnyte vault. Generates a coverage report showing which clients have agreements and which are missing. Optionally copies agreements to a central folder with standardized filenames.

**Who is this for?**
Wealth management firms that need to audit agreement coverage or find missing client agreements — especially during M&A transitions when verifying paperwork across merging books.

**How it works:**

| Step | What happens |
|------|-------------|
| **Connect** | Link your Egnyte account |
| **Pick location** | Choose your client folder |
| **Find agreements** | Locate files matching agreement patterns (CA, IMA, IPS, CEA) |
| **Report** | Generate a coverage report — who has agreements, who's missing |
| **Deduplicate** | Flag duplicate agreements across households |
| **Organize** | Optionally copy agreements to a central folder with standardized names |

> Your Egnyte credentials are encrypted. File scanning runs on your machine — LEA never sees your files.

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
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js load-config egnyte-agreement-organizer 2>/dev/null
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

Display folders as a numbered list (folder names only):

> **Folders in /Shared:**
>
> 1. Folder Name A
> 2. Folder Name B

Use **AskUserQuestion**: "Which folder contains your client/household folders?"
- List the first 4 folder names as options (or fewer if there are fewer)
- User can also type a folder name in "Other"

**Important: Internally map the user's selection back to the folder path from the JSON response. Never display full paths unless asked.**

### 4c: Confirm folder

List the contents of the selected folder:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-folders SELECTED_PATH 2>/dev/null
```

> **Folders inside "SELECTED_FOLDER_NAME":**
>
> (list first ~10 subfolder names)
>
> These look like your client/household folders.

Use **AskUserQuestion**: "Scan this folder for agreements?"
- "Yes, scan this folder" (description: "Search for client agreements in these folders")
- "Look inside a subfolder" (description: "Pick one of the subfolders above to go deeper")
- "Pick a different folder" (description: "Go back to the folder list")

### 4d: Save config

After confirming the folder, save the location for next time:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js save-config egnyte-agreement-organizer '{"folder_path": "FOLDER_PATH", "folder_name": "FOLDER_NAME"}' 2>/dev/null
```

---

## Step 5: Find Agreements + Report

Display exactly this:

> **Searching for client agreements...**
> This takes around 30 seconds, depending on how many files you have.

Run a single command that scans and generates the HTML report:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js scan-agreements FOLDER_PATH --report ${CLAUDE_SKILL_DIR}/../../scripts/agreement-report.html 2>/dev/null
```

**Do NOT show a summary table. Do NOT show stats, metrics, or agreement counts.** The report has all of this. Just open the report immediately.

Open the HTML report in the browser:

```bash
open "${CLAUDE_SKILL_DIR}/../../scripts/agreement-report.html"
```

Display exactly this:

> **Your Agreement Coverage Report is open in your browser.**
>
> It includes agreement coverage stats, which households have agreements, which are missing, and a CSV export.

---

## Step 6: Organize Agreements (Optional)

Use **AskUserQuestion**: "Want to copy these agreements to a central folder? (Originals stay in place — nothing is moved or deleted.)"
- "Yes, copy them" (description: "Copy agreements to a 'Client Agreements' folder with standardized names")
- "No, just the report" (description: "The report is already open — all done")

If "No", skip to Step 7.

### Naming Convention

Use **AskUserQuestion**: "How should the copied files be named?"
- "{Household} - {Doc Type} - {Date}.pdf" (description: "Example: Anderson James - IMA - 2024-03-15.pdf")
- "{Household} - {Doc Type}.pdf" (description: "Example: Anderson James - IMA.pdf (no date)")
- "Keep original names" (description: "Copy without renaming")

Doc type = inferred from original filename (CA, IMA, IPS, CEA).
Date = from filename if present, otherwise file last modified date.

### Run Organization

Build the organization plan from the scan data — for each agreement found, map to the new name based on the naming convention chosen. The household folder name typically contains the client name (e.g., "Anderson James & Linda"). Infer doc type from which pattern matched the filename (CEA, IMA, IPS, or CA). For date, extract from filename if present, otherwise use the file's `lastModified` date.

The target folder will be created as a sibling of the scanned folder. For example, if scanning `/Shared/Clients`, create `/Shared/Client Agreements`.

Display exactly this:

> **Copying agreements to "Client Agreements" folder...**

Do NOT narrate what you're building or skip — just run the command silently and show the result.

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js organize-agreements 'JSON_PLAN' 2>/dev/null
```

Where JSON_PLAN is:
```json
{
  "target_path": "/Shared/Client Agreements",
  "create_target_folder": true,
  "agreements": [
    { "src_path": "/Shared/Clients/Anderson/cea.pdf", "original_name": "cea.pdf", "new_name": "Anderson James - CEA - 2024-03-15.pdf" }
  ]
}
```

Parse the results. Show:

> **Organization Complete**
>
> | Result | Count |
> |--------|-------|
> | Copied | N |
> | Failed | N |
>
> Files copied to: **Client Agreements** folder in Egnyte

---

## Step 7: Done

Use **AskUserQuestion**: "What next?"
- "Scan another folder" (description: "Find agreements in a different folder") → Go to Step 4b
- "Done" (description: "Exit")

If "Done":

Log usage:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js log-usage egnyte-agreement-organizer 2>/dev/null
```

Display:

> **Done!** Got questions? Want more? claude-skills@getlea.io

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
| 5 | `scan-agreements` | Main search |
| 5 | `open` | Open report |
| 6 | `organize-agreements` | Optional organization |
| 7 | `log-usage` | Usage tracking (only on Done) |

**Total: 8-14 bash calls for full flow**
