# Dagger Module: App Hosting Deploy

## Overview

This Dagger module provides Firebase App Hosting deployment functionality for the staytuned.website project. It handles the complete deployment pipeline from source code to live Firebase App Hosting backends.

## Architecture

### Module Structure

```
dagger-deploy/
├── src/
│   └── index.ts          # Main module entry point
├── package.json          # Node.js dependencies
├── dagger.json          # Dagger module configuration
└── README.md            # This documentation
```

### Core Function: `deploy-apphosting`

The main function that orchestrates the entire deployment process.

#### Parameters

- `source`: Directory containing the application source code
- `project-id`: Firebase project ID
- `backend-id`: Target Firebase App Hosting backend ID
- `app-id`: Firebase app ID
- `gcp-credentials`: GCP service account credentials file path

#### Internal Flow

1. **Source Preparation**
   - Mounts source directory
   - Installs Node.js dependencies (`npm ci`)
   - Builds the application (`npm run build`)

2. **Firebase Authentication**
   - Uses provided GCP credentials
   - Authenticates with Firebase CLI

3. **App Hosting Deployment**
   - Deploys to specified backend
   - Returns the live service URL

## Usage in GitHub Actions

This module is used by 4 GitHub Actions workflows via a shared reusable workflow:

### Shared Workflow: `shared-app-hosting-deploy.yml`

All deployment workflows call this shared workflow with environment-specific parameters.

#### Input Parameters

- `backend_id`: Target backend identifier
- `environment_name`: GitHub environment for secrets
- `summary_title`: Title for deployment summary
- `extra_summary`: Additional summary content (optional)
- `is_pr`: Whether this is a PR deployment (affects concurrency)
- `pr_number`: PR number for PR deployments

### Environment-Specific Usage

#### 1. Development Environment (`dev-staytuned-website`)

**Workflow**: `app-hosting-main-dev-dagger.yml`
**Trigger**: Push to `main` branch
**Backend ID**: `dev-staytuned-website`

```yaml
# Called with:
backend_id: dev-staytuned-website
environment_name: dev-staytuned-website
summary_title: App Hosting Dev Deployment
```

**Use Case**: Continuous deployment of main branch to development environment for testing.

#### 2. Staging Environment (`stg-staytuned-website`)

**Workflow**: `app-hosting-main-stg-dagger.yml`
**Trigger**: Push to `main` branch
**Backend ID**: `stg-staytuned-website`

```yaml
# Called with:
backend_id: stg-staytuned-website
environment_name: stg-staytuned-website
summary_title: App Hosting Staging Deployment
```

**Use Case**: Pre-production testing environment, deployed alongside development.

#### 3. Production Environment (`prod-staytuned-website`)

**Workflow**: `app-hosting-main-prod-dagger.yml`
**Trigger**: Git tag push (releases)
**Backend ID**: `prod-staytuned-website`

```yaml
# Called with:
backend_id: prod-staytuned-website
environment_name: prod-staytuned-website
summary_title: App Hosting Production Deployment
extra_summary: "- **Tag**: ${{ github.ref_name }}"
```

**Use Case**: Production releases triggered by version tags.

#### 4. Pull Request Previews (`st-website-pr-{PR_NUMBER}`)

**Workflow**: `app-hosting-pr-dev-dagger.yml`
**Trigger**: PR opened/synchronized/reopened
**Backend ID**: `st-website-pr-${{ github.event.pull_request.number }}`

```yaml
# Called with:
backend_id: st-website-pr-${{ github.event.pull_request.number }}
environment_name: dev-staytuned-website
summary_title: App Hosting PR Preview Deployment
is_pr: true
pr_number: ${{ github.event.pull_request.number }}
```

**Use Case**: Isolated preview environments for each PR, with automatic cleanup on merge/close.

## Deployment Flow Examples

### Development Deployment

```
Push to main
    ↓
Workflow: app-hosting-main-dev-dagger.yml
    ↓
Shared Workflow: shared-app-hosting-deploy.yml
    ↓
Dagger Function: deploy-apphosting
    - source: .
    - backend-id: dev-staytuned-website
    ↓
Firebase App Hosting: dev-staytuned-website
```

### PR Preview Deployment

```
PR opened/updated
    ↓
Workflow: app-hosting-pr-dev-dagger.yml
    ↓
Shared Workflow: shared-app-hosting-deploy.yml
    ↓
Dagger Function: deploy-apphosting
    - source: .
    - backend-id: st-website-pr-123
    ↓
Firebase App Hosting: st-website-pr-123
    ↓
PR Comment: 🚀 Preview deployed at https://...
```

## Security & Authentication

- Uses GCP Workload Identity Federation
- Secrets managed via GitHub Environments
- Service account credentials passed securely via file paths

## Error Handling

- Validates required secrets before deployment
- Dagger handles build failures gracefully
- GitHub Actions provides deployment status and URLs

## Maintenance

- Single source of truth for deployment logic
- Environment-specific parameters isolated in workflow files
- Easy to add new environments or modify deployment steps

## Dependencies

- Node.js runtime
- Firebase CLI
- Dagger engine
- GCP credentials with App Hosting permissions
