---
description: Box Client Agreement Organizer — Find, inventory, and organize client agreements
---

# Box Client Agreement Organizer

You are running the Box Client Agreement Organizer skill — it finds client agreements by filename pattern across your Box vault, generates an inventory report showing which households have agreements and which are missing, and optionally copies agreements to a central folder with standardized names.

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

Parse the JSON. Store `registered`, `email`, `box_connected` for routing.

- If `registered` AND `box_connected` → skip to Step 3
- If `registered` but NOT `box_connected` → skip to Step 2
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

**Box Client Agreement Organizer** — A LEA Skill

**What does it do?**
Finds client agreements (CAs, IMAs, IPSs, CEAs) across all household folders in your Box vault. Generates a coverage report showing which clients have agreements and which are missing. Optionally copies agreements to a central folder with standardized filenames.

**Who is this for?**
Wealth management firms that need to audit agreement coverage or find missing client agreements — especially during M&A transitions when verifying paperwork across merging books.

**How it works:**

| Step | What happens |
|------|-------------|
| **Connect** | Link your Box account |
| **Pick folder** | Choose which Box folder contains your client folders |
| **Find agreements** | Locate files matching agreement patterns (CA, IMA, IPS, CEA) |
| **Report** | Generate a coverage report — who has agreements, who's missing |
| **Deduplicate** | Flag duplicate agreements across households |
| **Organize** | Optionally copy agreements to a central folder with standardized names |

> Credentials stored encrypted on LEA servers. All scanning runs locally — your files flow directly between your machine and Box, never through LEA.

---

Use **AskUserQuestion**: "Ready to get started?"
- "Let's go" (description: "Register and connect Box")
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

Otherwise display: "Registered! Now let's connect your Box account."

---

## Step 2: Box Connection (first run only)

### 2a: Approve the LEA app in Box (one-time admin step)

Use **AskUserQuestion**: "Are you a Box admin at your firm?"
- "Yes, I'm a Box admin" (description: "I can approve apps in the Admin Console")
- "No, I'll need my admin's help" (description: "Someone else manages our Box account")

#### If admin:

Display exactly this:

> **First, approve the LEA app in your Box Admin Console.**
>
> Here's what to do:
> 1. I'll open the **Platform Apps Manager** for you
> 2. Click the **"+"** button
> 3. Enter Client ID: `4mmneghj3fxw4x3adr13bdooz6zy8qy1`
> 4. Approve **LEA Skills for Box**

Use **AskUserQuestion**: "Ready to open the Platform Apps Manager?"
- "Open it" (description: "Open Box Admin Console → Platform Apps Manager")
- "Already approved" (description: "App was approved previously, skip ahead")

If "Open it", open the link:

```bash
open "https://app.box.com/master/platform-apps"
```

Then use **AskUserQuestion**: "Let me know when the app is approved."
- "Done" (description: "App approved, continue")
- "Need help" (description: "I'm stuck")

#### If not admin:

Display exactly this:

> **A Box admin at your firm needs to approve the LEA app first.** This is a one-time step.
>
> Send this to your admin:
>
> ---
>
> *Please approve the LEA app in Box:*
> 1. *Go to the **Admin Console** → **Platform Apps Manager** (https://app.box.com/master/platform-apps)*
> 2. *Click the **"+"** button*
> 3. *Enter Client ID: `4mmneghj3fxw4x3adr13bdooz6zy8qy1`*
> 4. *Approve **LEA Skills for Box***
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
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js auth-box 2>/dev/null
```

Parse the JSON. Extract `auth_url` and `session_id`.

Display exactly this:

> **Now let's authorize your Box account.**
>
> Make sure you're logged into Box in your browser. I'll open the authorization page for you.

Open the auth URL in the browser automatically:

```bash
open "AUTH_URL"
```

Display exactly this:

> Approve access in the browser tab that just opened, then come back here.

Wait for OAuth completion (polls automatically for up to 2 minutes):

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js poll-box-wait SESSION_ID 2>/dev/null
```

- If `status` is `"connected"` → proceed to Step 3
- If `status` is `"failed"`, `"expired"`, or `"timeout"` → show the error and ask to retry

Display: "Box connected!"

---

## Step 3: Verify Connection

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js verify-box 2>/dev/null
```

Parse JSON. Show:

> **Box Connected**
> Logged in as: **USER_NAME** (USER_LOGIN)

---

## Step 4: Choose Root Folder

Display: "Loading your Box folders..."

List the root Box folders:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-folders 2>/dev/null
```

Display folders as a numbered list (show folder names only, never show folder IDs to the user):

> **Your Box folders:**
>
> 1. Folder Name A
> 2. Folder Name B

Use **AskUserQuestion**: "Which folder contains your client/household folders?"
- List the first 4 folder names as options
- User can also type a folder name in "Other"

**Important: Internally map the user's selection back to the folder ID from the JSON response. Never display folder IDs.**

Confirm by listing subfolders:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-folders SELECTED_FOLDER_ID 2>/dev/null
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

---

## Step 5: Find Agreements + Report

Display exactly this:

> **Searching for client agreements...**
> This takes around 30 seconds, depending on how many files you have.

Run a single command that scans and generates the HTML report:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js scan-agreements FOLDER_ID --report ${CLAUDE_SKILL_DIR}/../../scripts/agreement-report.html 2>/dev/null
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
Date = from filename if present, otherwise file created date.

### Run Organization

Build the organization plan from the scan data — for each agreement found, map to the new name based on the naming convention chosen. The household folder name typically contains the client name (e.g., "Anderson James & Linda"). Infer doc type from which pattern matched the filename (CEA, IMA, IPS, or CA). For date, extract from filename if present, otherwise use the file's `modified_at` date.

Display exactly this:

> **Copying agreements to "Client Agreements" folder...**

Do NOT narrate what you're building or skip — just run the command silently and show the result.

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js organize-agreements 'JSON_PLAN' 2>/dev/null
```

Where JSON_PLAN is:
```json
{
  "parent_folder_id": "ROOT_FOLDER_ID",
  "create_target_folder": true,
  "target_folder_name": "Client Agreements",
  "agreements": [
    { "file_id": "123", "original_name": "cea.pdf", "new_name": "Anderson James - CEA - 2024-03-15.pdf" }
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
> Files copied to: **Client Agreements** folder in Box

Open the Box folder:

```bash
open "https://app.box.com/folder/TARGET_FOLDER_ID"
```

---

## Step 7: Done

Use **AskUserQuestion**: "What next?"
- "Scan another folder" (description: "Find agreements in a different folder") → Go to Step 4
- "Done" (description: "Exit")

If "Done":

Log usage:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js log-usage box-agreement-organizer 2>/dev/null
```

Display:

> **Done!** Got questions? Want more? claude-skills@getlea.io

---

## Error Handling

- If `success: false` in any CLI response, show the error message and ask to retry or exit
- If Box auth fails or token is expired, suggest re-running the skill to re-authorize
- Parse JSON from stdout only (logs go to stderr via `2>/dev/null`)

## Bash Call Summary

| Step | Command | When |
|------|---------|------|
| 0 | `git pull` | Always (silent) |
| 0 | `npm install` | Always (silent) |
| 0 | `check-setup` | Always |
| 1 | `register` | First run only |
| 2 | `auth-box` | First run only |
| 2 | `poll-box-wait` | First run only |
| 2 | `open` | First run only (OAuth URL) |
| 3 | `verify-box` | Always |
| 4 | `list-folders` | Folder selection (1-3 calls) |
| 5 | `scan-agreements` | Main search |
| 5 | `open` | Open report |
| 6 | `organize-agreements` | Optional organization |
| 6 | `open` | Open Box folder |
| 7 | `log-usage` | Usage tracking (only on Done) |

**Total: 7-12 bash calls for full flow**
