# Shipping Process

This is a public repo that distributes code to wealth management firms. Every merge to `main` is a production release. Act accordingly.

## Branch Strategy

- `main` = production. What marketplace users install. Never commit directly.
- `dev` = working branch for development and testing.
- Feature branches off `dev` for larger changes.

All changes reach `main` through a PR from `dev`. No exceptions.

## How to Ship

1. Work on `dev` (or a feature branch off `dev`)
2. Edit plugin code in `plugins/<name>/`
3. Test locally (see Pre-Release Checklist below)
4. PR from `dev` → `main`
5. Get a code review. At minimum, one other person reads the diff.
6. After merge, run `bin/release <patch|minor|major>` on `main`
7. The script bumps versions, commits, tags, pushes, and creates a GitHub Release
8. Users update via `claude plugin update <name>@lea-wealth-plugins`

```bash
bin/release patch            # 1.1.0 → 1.1.1
bin/release minor            # 1.1.0 → 1.2.0
bin/release major            # 1.1.0 → 2.0.0
bin/release patch --dry-run  # preview without changes
```

## Pre-Release Checklist

Run these before opening a PR to `main`. The release script enforces some of these, but catch problems before review, not after.

### 1. Plugin functionality

```bash
node plugins/<name>/scripts/cli.js check-setup
npm install --prefix plugins/<name>/scripts
```

Run the full skill flow end-to-end for any plugin you changed.

### 2. Dependency audit

Every plugin runs `npm install` on user machines during Step 0. Vulnerable or compromised dependencies ship directly to customers.

```bash
for dir in plugins/*/scripts; do
  npm audit --prefix "$dir" --audit-level=high
done
```

Fix or document any findings before merging.

### 3. `lea-skills-api.js` consistency

This file is copy-pasted across all 11 plugins. Every copy must be identical. A divergence in one plugin could redirect API calls or leak tokens.

```bash
checksum=$(md5 -q plugins/box-client-file-inventory/scripts/lea-skills-api.js)
for f in plugins/*/scripts/lea-skills-api.js; do
  if [ "$(md5 -q "$f")" != "$checksum" ]; then
    echo "MISMATCH: $f"
  fi
done
```

If you need to change `lea-skills-api.js`, change it in one plugin and copy to all others in the same commit.

### 4. No hardcoded endpoint overrides

The `LEA_SKILLS_API` env var lets users point to a custom API server. No plugin should contain a hardcoded non-HTTPS endpoint or override the default.

```bash
grep -r 'http://' plugins/ --include='*.js'
```

This should return zero results.

### 5. No secrets or local artifacts

```bash
git diff --cached --name-only | grep -iE '\.env|credential|secret|token|\.log'
```

The release script should never use `git add -A`. Only stage version-bumped files explicitly.

## Version Rules

- Version in each plugin's `plugin.json` and the root `marketplace.json` must match
- Version must change for the cache to update — same version = "already at latest" even if code changed
- Use semver: patch for fixes, minor for features, major for breaking changes

## Plugin Architecture

Each plugin must be self-contained. Shared code at the monorepo root is NOT included in the plugin cache. Every plugin has its own `scripts/` directory with all dependencies.

Installed plugins are cached at: `~/.claude/plugins/cache/lea-wealth-plugins/<plugin>/<version>/`

Plugin `step0` bash commands (in SKILL.md) that run `git pull` need `|| true` because cached copies are shallow clones where `git pull` fails with exit 128.

## Branch Protection (TODO)

Enable on `main` once the team agrees on rules:

- Require PR before merging (no direct push)
- Require at least 1 approval
- No force pushes
- Optionally require status checks (if CI is added later)

This is the single most important guardrail for a public repo. Without it, `bin/release` is the only gate and it doesn't enforce review.

## What LEA Servers Never See

Reiterated here because it matters for release confidence: plugins make direct API calls from the user's machine to their platforms (Box, SharePoint, Egnyte, Wealthbox, Practifi). LEA servers relay OAuth tokens only. File contents and CRM data never touch LEA infrastructure. A bad release doesn't just break functionality — it could misdirect credential flows. Review accordingly.
