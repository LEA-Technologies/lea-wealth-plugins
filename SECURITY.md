# Security Model

## How LEA Skills Work

LEA skills run locally in Claude Code on the user's machine. Each skill connects to a user's existing platforms (Box, SharePoint, Egnyte, Wealthbox, Practifi) through OAuth credentials managed by the LEA Skills API.

## Credential Storage

### LEA API Token
- Stored locally at `~/.lea-skills/credentials.json` with restricted file permissions (mode 0600)
- Created during one-time registration (`register <email>`)
- Used to authenticate with the LEA Skills API (`skills.getlea.io`)

### Platform Credentials (Box, SharePoint, Egnyte, Practifi, Wealthbox)
- OAuth tokens are stored server-side in the LEA Skills API database
- Skills retrieve tokens on demand via authenticated API calls
- Tokens are held in memory during execution, never written to disk
- Token refresh is handled server-side

## Data Flow

```
User's Machine                    LEA Skills API                Platform (Box, etc.)
─────────────                    ──────────────                ────────────────────
Skill executes locally    →      Returns OAuth token    →      API calls go direct
                                 (token relay only)            from user's machine
                                                               to platform

CRM/vault data flows directly between the user's machine and the platform.
LEA servers never see, store, or proxy CRM or vault data.
```

### What LEA servers store
- Customer email and firm name (registration)
- OAuth tokens for connected platforms (encrypted at rest)
- Skill configuration (e.g., folder paths, field mappings)
- Usage telemetry (skill name, timestamp)

### What LEA servers never see
- File contents from Box, SharePoint, or Egnyte
- Contact records from Wealthbox or Practifi
- Generated reports (HTML files stay on the user's machine)

## Attack Surface

### Marketplace trust boundary
Skills are distributed through the LEA plugin marketplace on GitHub (`LEA-Technologies/lea-wealth-plugins`). This is the same trust model as npm packages or VS Code extensions — users trust the publisher.

- **Malicious code in skills:** Requires write access to the LEA-Technologies GitHub org
- **Social engineering:** An attacker could create a fake marketplace and convince a user to add it. This requires active deception and is not specific to LEA.

### Local attack surface
- `~/.lea-skills/credentials.json` contains the LEA API token. File permissions are restricted to owner-only (0600).
- Platform OAuth tokens are retrieved over HTTPS and held in memory during execution.
- The `LEA_SKILLS_API` environment variable can override the API endpoint. If an attacker controls the user's environment, they can redirect API calls.

## Reporting Issues

Contact [claude-skills@getlea.io](mailto:claude-skills@getlea.io) to report security concerns.
