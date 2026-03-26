# Dagger Deploy Module

Firebase App Hosting deployment module for staytuned.website.

## Quick Start

This module provides automated deployment to Firebase App Hosting backends.

## Documentation

See [DAGGER_MODULE_DOCS.md](./DAGGER_MODULE_DOCS.md) for complete documentation including:

- Internal flow and architecture
- Usage in GitHub Actions workflows
- Environment-specific deployment examples
- Security and maintenance information

## Usage

```bash
dagger call deploy-apphosting \
  --source=. \
  --project-id=your-project \
  --backend-id=your-backend \
  --app-id=your-app-id \
  --gcp-credentials=file:credentials.json
```
