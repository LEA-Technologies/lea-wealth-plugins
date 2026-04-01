---
description: SharePoint Client Agreement Organizer — Find, inventory, and organize client agreements
---

# SharePoint Client Agreement Organizer

You are running the SharePoint Client Agreement Organizer skill — it finds client agreements by filename pattern across your SharePoint vault, generates an inventory report showing which households have agreements and which are missing, and optionally copies agreements to a central folder with standardized names.

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

Parse the JSON. Store `registered`, `email`, `sharepoint_connected` for routing.

- If `registered` AND `sharepoint_connected` → skip to Step 3
- If `registered` but NOT `sharepoint_connected` → skip to Step 2
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

**SharePoint Client Agreement Organizer** — A LEA Skill

**What does it do?**
Finds client agreements (CAs, IMAs, IPSs, CEAs) across all household folders in your SharePoint vault. Generates a coverage report showing which clients have agreements and which are missing. Optionally copies agreements to a central folder with standardized filenames.

**Who is this for?**
Wealth management firms that need to audit agreement coverage or find missing client agreements — especially during M&A transitions when verifying paperwork across merging books.

**How it works:**

| Step | What happens |
|------|-------------|
| **Connect** | Link your Microsoft 365 account |
| **Pick location** | Choose your SharePoint site, library, and client folder |
| **Find agreements** | Locate files matching agreement patterns (CA, IMA, IPS, CEA) |
| **Report** | Generate a coverage report — who has agreements, who's missing |
| **Deduplicate** | Flag duplicate agreements across households |
| **Organize** | Optionally copy agreements to a central folder with standardized names |

> Your SharePoint credentials are encrypted. File scanning runs on your machine — LEA never sees your files.

---

Use **AskUserQuestion**: "Ready to get started?"
- "Let's go" (description: "Register and connect SharePoint")
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

Otherwise display: "Registered! Now let's connect your SharePoint account."

---

## Step 2: SharePoint Connection (first run only)

### 2a: Admin consent (one-time step)

This skill requires Microsoft 365 permissions (`Files.ReadWrite.All`, `Sites.Read.All`) that need an admin to approve the LEA app for your organization. This is a one-time step — once approved, everyone at the firm can connect.

Use **AskUserQuestion**: "Are you a Microsoft 365 admin at your firm? (Global Admin, Application Admin, or Cloud Application Admin)"
- "Yes, I'm an admin" (description: "I can approve apps in the Microsoft Entra admin center")
- "No, I'll need my admin's help" (description: "Someone else manages our Microsoft 365 tenant")
- "Already approved" (description: "An admin already approved the LEA app, skip ahead")

#### If "Already approved" → skip to Step 2b.

#### If admin:

Display exactly this:

> **Great — when you sign in next, Microsoft will ask you to consent on behalf of your organization.**
>
> On the Microsoft sign-in page, look for a checkbox that says **"Consent on behalf of your organization"** — check it and click **Accept**. This grants the LEA app access to read SharePoint files and copy them within your vault for everyone at your firm.
>
> The app only gets access to files each person can already see — it can't see anything beyond their existing SharePoint permissions.

Then proceed to Step 2b.

#### If not admin:

Display exactly this:

> **A Microsoft 365 admin at your firm needs to approve the LEA app first.** This is a one-time step.
>
> Send this to your admin:
>
> ---
>
> *Please approve the LEA Skills app for SharePoint access:*
>
> 1. *Open this link:*
>    `https://login.microsoftonline.com/common/adminconsent?client_id=YOUR_MS_CLIENT_ID`
> 2. *Sign in with your admin account*
> 3. *Review the permissions (SharePoint file access) and click **Accept***
>
> *This grants LEA access to read and copy SharePoint files. Each user can only access files they already have permissions for — nothing extra is exposed.*
>
> ---

Use **AskUserQuestion**: "Let me know when your admin has approved the app."
- "It's approved" (description: "My admin approved it, continue")
- "Not yet" (description: "I'll come back later")

If "Not yet", display exactly this:

> No problem — run this skill again once the app is approved.

Then stop.

### 2b: Authorize via OAuth

Get the OAuth URL:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js auth-sharepoint 2>/dev/null
```

Parse the JSON. Extract `auth_url` and `session_id`.

Display exactly this:

> **Now let's connect your Microsoft 365 account.**
>
> I'll open a Microsoft sign-in page. Sign in with your work account and approve access.

Open the auth URL in the browser automatically:

```bash
open "AUTH_URL"
```

Display exactly this:

> Sign in and approve access in the browser tab that just opened, then come back here.

Wait for OAuth completion (polls automatically for up to 2 minutes):

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js poll-sharepoint-wait SESSION_ID 2>/dev/null
```

- If `status` is `"connected"` → proceed to Step 3
- If `status` is `"failed"`, `"expired"`, or `"timeout"` → show the error and ask to retry. **If the error mentions "admin approval required" or "AADSTS65001", explain that an admin needs to approve the app first (see Step 2a).**

Display: "SharePoint connected!"

---

## Step 3: Verify Connection

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js verify-sharepoint 2>/dev/null
```

Parse JSON. Show:

> **SharePoint Connected**
> Logged in as: **DISPLAY_NAME** (MAIL)

---

## Step 4: Choose Site, Library, and Folder

### 4a: Try loading saved config

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js load-config sharepoint-agreement-organizer 2>/dev/null
```

If config exists and has `site_id`, `drive_id`, `folder_id`, and `site_name`, `library_name`, `folder_name`:

Display:

> **Previously used location:**
> Site: **SITE_NAME** → Library: **LIBRARY_NAME** → Folder: **FOLDER_NAME**

Use **AskUserQuestion**: "Use this location again?"
- "Yes, use saved location" (description: "Scan the same site/library/folder as last time")
- "Pick a different location" (description: "Choose a new site, library, and folder")

If "Yes", skip to Step 5 using the saved `drive_id` and `folder_id`.

### 4b: Pick a SharePoint site

Display: "Loading your SharePoint sites..."

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-sites 2>/dev/null
```

Display sites as a numbered list (show site names only, never show IDs to the user):

> **Your SharePoint sites:**
>
> 1. Site Name A
> 2. Site Name B

Use **AskUserQuestion**: "Which site has your client documents?"
- List the first 4 site names as options (or fewer if there are fewer)
- User can also type a site name in "Other"

**Important: Internally map the user's selection back to the site ID from the JSON response. Never display IDs.**

### 4c: Pick a document library

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-libraries SELECTED_SITE_ID 2>/dev/null
```

Display libraries as a numbered list:

> **Document libraries in "SITE_NAME":**
>
> 1. Documents
> 2. Client Files

If there is only one library, auto-select it and display: "Using library: **LIBRARY_NAME**"

Otherwise use **AskUserQuestion**: "Which library?"
- List the first 4 library names as options

### 4d: Pick a folder

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-folders SELECTED_DRIVE_ID 2>/dev/null
```

Display folders as a numbered list (folder names only):

> **Folders in "LIBRARY_NAME":**
>
> 1. Folder Name A
> 2. Folder Name B

Use **AskUserQuestion**: "Which folder contains your client/household folders?"
- List the first 4 folder names as options
- User can also type a folder name in "Other"

Confirm by listing subfolders:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-folders SELECTED_DRIVE_ID SELECTED_ITEM_ID 2>/dev/null
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

### 4e: Save config

After confirming the folder, save the location for next time:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js save-config sharepoint-agreement-organizer '{"site_id": "SITE_ID", "site_name": "SITE_NAME", "drive_id": "DRIVE_ID", "library_name": "LIBRARY_NAME", "folder_id": "FOLDER_ID", "folder_name": "FOLDER_NAME"}' 2>/dev/null
```

---

## Step 5: Find Agreements + Report

Display exactly this:

> **Searching for client agreements...**
> This takes around 30 seconds, depending on how many files you have.

Run a single command that scans and generates the HTML report:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js scan-agreements DRIVE_ID FOLDER_ID --report ${CLAUDE_SKILL_DIR}/../../scripts/agreement-report.html 2>/dev/null
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

Build the organization plan from the scan data — for each agreement found, map to the new name based on the naming convention chosen. The household folder name typically contains the client name (e.g., "Anderson James & Linda"). Infer doc type from which pattern matched the filename (CEA, IMA, IPS, or CA). For date, extract from filename if present, otherwise use the file's `lastModifiedDateTime` date.

Display exactly this:

> **Copying agreements to "Client Agreements" folder...**

Do NOT narrate what you're building or skip — just run the command silently and show the result.

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js organize-agreements 'JSON_PLAN' 2>/dev/null
```

Where JSON_PLAN is:
```json
{
  "drive_id": "DRIVE_ID",
  "parent_folder_id": "ROOT_FOLDER_ID",
  "create_target_folder": true,
  "target_folder_name": "Client Agreements",
  "agreements": [
    { "file_id": "abc123", "original_name": "cea.pdf", "new_name": "Anderson James - CEA - 2024-03-15.pdf" }
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
> Files copied to: **Client Agreements** folder in SharePoint

---

## Step 7: Done

Use **AskUserQuestion**: "What next?"
- "Scan another folder" (description: "Find agreements in a different folder") → Go to Step 4b
- "Done" (description: "Exit")

If "Done":

Log usage:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js log-usage sharepoint-agreement-organizer 2>/dev/null
```

Display:

> **Done!** Got questions? Want more? claude-skills@getlea.io

---

## Error Handling

- If `success: false` in any CLI response, show the error message and ask to retry or exit
- If SharePoint auth fails or token is expired, suggest re-running the skill to re-authorize
- Parse JSON from stdout only (logs go to stderr via `2>/dev/null`)

## Bash Call Summary

| Step | Command | When |
|------|---------|------|
| 0 | `git pull` | Always (silent) |
| 0 | `npm install` | Always (silent) |
| 0 | `check-setup` | Always |
| 1 | `register` | First run only |
| 2a | (no CLI) | Admin consent — instructions only |
| 2b | `auth-sharepoint` | First run only |
| 2b | `open` | First run only (OAuth URL) |
| 2b | `poll-sharepoint-wait` | First run only |
| 3 | `verify-sharepoint` | Always |
| 4 | `load-config` | Check saved location |
| 4 | `list-sites` | Site selection |
| 4 | `list-libraries` | Library selection |
| 4 | `list-folders` | Folder selection (1-3 calls) |
| 4 | `save-config` | Save chosen location |
| 5 | `scan-agreements` | Main search |
| 5 | `open` | Open report |
| 6 | `organize-agreements` | Optional organization |
| 7 | `log-usage` | Usage tracking (only on Done) |

**Total: 9-16 bash calls for full flow**
