---
description: Box File Inventory Report — Take inventory of files across your Box vault and generate an organized report
---

# Box File Inventory Report

You are running the Box File Inventory skill — it scans a Box folder tree, catalogs every file per household folder with document category tagging, and generates an HTML report.

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

**Box File Inventory Report** — A LEA Skill

**What does it do?**
Takes inventory of your Box vault — every file across all client and household folders, organized by document type (agreements, tax docs, statements, and more). Generates an HTML report you can open in your browser with one click.

**Who is this for?**
Wealth management firms that store client documents in Box and want a clear picture of what's in their vault — file counts, document categories, and which households have gaps.

**How it works:**

| Step | What happens |
|------|-------------|
| **Connect** | Securely link your Box account via OAuth |
| **Pick folder** | Choose which Box folder contains your client folders |
| **Inventory** | Catalog every file and tag it by document type |
| **Report** | Generate an HTML report with stats, categories, and CSV export |

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
> 3. ...

Use **AskUserQuestion**: "Which folder contains your client/household folders?"
- List the first 4 folder names as options (or fewer if there are fewer)
- User can also type a folder name in "Other"

**Important: Internally map the user's selection back to the folder ID from the JSON response. Never display folder IDs.**

Confirm by listing subfolders:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js list-folders SELECTED_FOLDER_ID 2>/dev/null
```

Show the subfolders (names only, no IDs):

> **Folders inside "SELECTED_FOLDER_NAME":**
>
> (list first ~10 subfolder names)
>
> These look like your client/household folders.

Use **AskUserQuestion**: "Ready to take inventory of this folder?"
- "Yes, take inventory" (description: "Inventory all files across these household folders")
- "Go back" (description: "Pick a different folder")
- "Go deeper" (description: "Look inside one of these folders first")

If "Go back" → repeat Step 4. If "Go deeper" → ask which subfolder, list it, repeat.

---

## Step 5: Take Inventory + Report

Display exactly this:

> **Taking inventory of all files in "FOLDER_NAME"...**
> This takes around 30 seconds, depending on how many files you have.

Run a single command that inventories and generates the HTML report:

```bash
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js scan-inventory FOLDER_ID --report ${CLAUDE_SKILL_DIR}/../../scripts/inventory-report.html 2>/dev/null
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
node ${CLAUDE_SKILL_DIR}/../../scripts/cli.js log-usage box-file-inventory 2>/dev/null
```

Display exactly this:

> **Done!** Got questions? Want more? claude-skills@getlea.io

Use **AskUserQuestion**: "What next?"
- "Inventory another folder" (description: "Run on a different folder") → Go to Step 4
- "Done" (description: "Exit")

---

## Error Handling

- If `success: false` in any CLI response, show the error message and ask to retry or exit
- If Box auth fails or token is expired, suggest re-running the skill to re-authorize
- Parse JSON from stdout only (logs go to stderr via `2>/dev/null`)

## Bash Call Summary

| Step | Command | When |
|------|---------|------|
| 0 | `npm install` | Always (silent) |
| 0 | `check-setup` | Always |
| 1 | `register` | First run only |
| 2 | `auth-box` | First run only |
| 2 | `poll-box-wait` | First run only |
| 2 | `open` | First run only (OAuth URL) |
| 3 | `verify-box` | Always |
| 4 | `list-folders` | Folder selection (1-3 calls) |
| 5 | `scan-inventory` | Main inventory |
| 5 | `open` | Open report |
| 7 | `log-usage` | Usage tracking |

**Total: 6-10 bash calls for full flow**
