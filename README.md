# LEA Wealth Plugins

Self-serve wealth management skills for [Claude Code](https://claude.com/claude-code) and Claude Cowork.

## Install

Add the LEA marketplace:

```
claude plugin marketplace add LEA-Technologies/lea-wealth-plugins
```

Then install any plugin:

```
claude plugin install <plugin-name>@lea-wealth-plugins
```

## Available Skills

### Document Vault — File Inventory

Scan your entire vault and generate an interactive HTML report of every file across all client folders, organized by document type.

| Plugin | Vault |
|--------|-------|
| `box-client-file-inventory` | Box |
| `sharepoint-client-file-inventory` | SharePoint |
| `egnyte-client-file-inventory` | Egnyte |

### Document Vault — Agreement Organizer

Find client agreements (CAs, IMAs, IPSs, CEAs) across your vault. Coverage report with optional organize to a central folder.

| Plugin | Vault |
|--------|-------|
| `box-client-agreement-organizer` | Box |
| `sharepoint-client-agreement-organizer` | SharePoint |
| `egnyte-client-agreement-organizer` | Egnyte |

### CRM — Data Completeness Audit

Scan your CRM for missing and incomplete contact data. Interactive report with completeness scores, field coverage, and CSV export.

| Plugin | CRM |
|--------|-----|
| `wealthbox-data-completeness-audit` | Wealthbox |
| `practifi-data-completeness-audit` | Practifi |

### CRM — Agreement Compliance

Cross-reference CRM households with your document vault to find which clients are missing required agreements. Compliance gap report with CSV export.

| Plugin | CRM |
|--------|-----|
| `wealthbox-agreement-compliance` | Wealthbox |
| `practifi-agreement-compliance` | Practifi |

## Requirements

Each skill connects to your firm's existing platforms. You'll need:

- A [LEA](https://getlea.io) account with the relevant platform integrations enabled
- Access credentials for your vault and/or CRM (configured during first run)

## Support

Contact [claude-skills@getlea.io](mailto:claude-skills@getlea.io) for help with setup or issues.
