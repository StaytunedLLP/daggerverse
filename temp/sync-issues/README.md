# 🔄 Planning Lifecycle Sync Scripts

Automation scripts for syncing planning documentation with GitHub Issues after Requirement Agent workflow completion.

## 📁 Structure

```
.github/sync-issues/
├── src/
│   ├── sync-planning.ts          # Main orchestration script
│   ├── sync-remote-config.ts     # Firebase Remote Config sync
│   ├── validate-docs.ts          # Document validation
│   ├── generate-local-config.ts  # Local config generation
│   ├── anchor-flag-keys.ts       # Flag key anchoring
│   └── cleanup-remote-config.ts  # Orphaned flag cleanup
├── lib/
│   ├── document.ts               # Document processing
│   ├── parser.ts                 # Markdown/frontmatter parsing
│   ├── github.ts                 # GitHub API interactions
│   ├── git.ts                    # Git operations
│   ├── effects.ts                # Side effects (file I/O, etc.)
│   ├── fp.ts                     # Functional programming utilities
│   ├── types.ts                  # Type definitions
│   └── ...
└── tests/                        # Unit and integration tests
```

## 🎯 Purpose

This automation runs **after** the Planning PR is merged to `main` and:

1. ✅ Creates GitHub Issues for all Epic and Feature documents
2. ✅ Links Features as sub-issues to their parent Epics
3. ✅ Creates Flag issues linked to Features
4. ✅ Updates frontmatter with `issue_url` and `issue_number`
5. ✅ Renames files with issue number prefixes (e.g., `feat-12-login.md`)
6. ✅ Repairs internal document links to match new filenames
7. ✅ Creates cleanup PR: `docs: sync issue identities`
8. ✅ Adds domain labels to issues (e.g., `itsme.fashion`, `admin.itsme.fashion`)

## 📂 DDD Folder Structure

The automation follows a Domain-Driven Design (DDD) folder architecture:

```
root/
├── research/                      # Raw research & discovery (NOT tracked)
├── src/
│   ├── requirement/               # Global requirements (vision, strategy, roadmaps)
│   │   └── [global-docs].md
│   ├── shared/                    # Global shared utilities
│   └── [domain-name]/             # Each domain (e.g., itsme.fashion)
│       └── requirement/           # Domain-specific requirements
│           ├── epics/
│           │   └── [epic].md
│           └── features/
│               └── [context]/
│                   └── [feature].md
└── docs/                          # Documentation (guides, API docs)
```

### Domain Examples

- `src/itsme.fashion/requirement/epics/` - Storefront epics
- `src/itsme.fashion/requirement/features/catalog/` - Storefront catalog features
- `src/admin.itsme.fashion/requirement/epics/` - Admin epics
- `src/partner.itsme.fashion/requirement/features/` - Partner features

## 🚀 Workflow Trigger

Defined in `.github/workflows/sync-planning.yml`:

- **Trigger:** Push to `main` branch
- **Paths:** Changes to `src/requirement/**` and `src/*/requirement/**`
- **Permissions:** `issues: write`, `pull-requests: write`, `contents: write`

## 📋 Prerequisites

- GitHub token with appropriate permissions (automatically provided by GitHub Actions)
- Node.js 22+
- Repository with DDD structure as defined above

## 🔧 Usage

### Automatic (GitHub Actions)

Runs automatically when Planning PR is merged to `main`.

### Manual Testing

```bash
# Set GitHub token
export GH_TOKEN=your_github_token

# Run script
node .github/sync-issues/dist/src/sync-planning.js
```

## 📝 What Gets Created

### Epic Issues

- **Type:** Epic (if available in repo)
- **Title:** Epic name from frontmatter
- **Body:** Epic document content
- **Labels:** Domain label (e.g., `itsme.fashion`) for domain-specific epics

### Feature Issues

- **Type:** Feature (if available in repo)
- **Title:** Feature name from frontmatter
- **Body:** Feature document content with Gherkin scenarios
- **Parent:** Linked to Epic via Sub-issue API
- **Labels:** Domain label (e.g., `itsme.fashion`) for domain-specific features

### Flag Issues

- **Type:** Flag (if available in repo)
- **Title:** `feature_fe_{feature_issue}_fl_{flag_issue}_{context}_enabled`
- **Body:** Feature flag configuration
- **Parent:** Linked to Feature via Sub-issue API

## 🏷️ Domain Labels

Issues are automatically labeled with their domain name:

| Domain Path | Label |
|-------------|-------|
| `src/itsme.fashion/requirement/...` | `itsme.fashion` |
| `src/admin.itsme.fashion/requirement/...` | `admin.itsme.fashion` |
| `src/partner.itsme.fashion/requirement/...` | `partner.itsme.fashion` |
| `src/requirement/...` (global) | No label |

## 🔄 File Renaming Convention

**Before:**

```
src/itsme.fashion/requirement/features/auth/feat-login.md
```

**After:**

```
src/itsme.fashion/requirement/features/auth/feat-12-login.md
```

Where `12` is the GitHub issue number.

## ⚙️ Configuration

No configuration needed. Script reads:

- Repository structure from `src/*/requirement/`
- Frontmatter from markdown files
- Issue types from GitHub API

## 🐛 Troubleshooting

### Script fails with "Invalid frontmatter"

→ Ensure all feature files have valid YAML frontmatter with required fields:

- `feature_name`
- `parent_epic`
- `bounded_context`

### Issues not created

→ Check GitHub Actions logs for API errors
→ Verify token permissions

### Links not repaired

→ Ensure links use relative paths
→ Check that linked files exist

### No domain directories found

→ Ensure your domain directories follow the pattern: `src/[domain-name]/requirement/`

## 📚 Related Documentation

- Requirement Agent: `instructions/agents/Requirement.md`
- Quick Start Guide: `instructions/agents/README.md`
- Feature Template: `instructions/skills/doc-feature-specification/assets/feature-spec.template.md`

---

**Last Updated:** 2026-01-27
