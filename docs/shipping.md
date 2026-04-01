# Shipping Process

## Branch Strategy

- `main` = production (what marketplace users get)
- `dev` = working branch for development and testing

## How to Ship a Plugin Update

1. Work on `dev` branch
2. Edit plugin code in `plugins/<name>/`
3. Bump version in the plugin's `.claude-plugin/plugin.json`
4. Bump version in root `.claude-plugin/marketplace.json` (must match)
5. Test locally: `node plugins/<name>/scripts/cli.js check-setup`
6. PR from `dev` → `main`
7. Merge = publish. Users update via `claude plugin update <name>@lea-wealth-plugins`

## Version Rules

- Version in `plugin.json` and `marketplace.json` must match
- Version must change for the cache to update — same version = "already at latest" even if code changed
- Use semver: patch (1.1.1) for fixes, minor (1.2.0) for features, major (2.0.0) for breaking changes

## Plugin Cache

Installed plugins are cached at `~/.claude/plugins/cache/lea-wealth-plugins/<plugin>/<version>/`

Each plugin must be **self-contained** — shared code at the monorepo root is NOT included in the cache. Every plugin has its own `scripts/` directory with all dependencies.

## Step 0 Bash Commands

Plugin `step0` bash commands (in SKILL.md) that run `git pull` need `|| true` because cached copies are shallow clones where `git pull` fails with exit 128.

## Testing

After changes, verify:
1. `check-setup` command works: `node plugins/<name>/scripts/cli.js check-setup`
2. `npm install` works: `npm install --prefix plugins/<name>/scripts`
3. Full skill flow runs end-to-end
