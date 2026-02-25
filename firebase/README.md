# Firebase Dagger Module

This module provides a reusable pipeline for building and deploying applications to Firebase.

## Usage

```bash
dagger call firebase-deploy --source . --project-id YOUR_PROJECT_ID --gcp-credentials file:./path/to/creds.json
```

## Functions

### firebaseDeploy

Automatically installs dependencies, builds the project, and deploys to Firebase.

| Argument | Type | Description |
| --- | --- | --- |
| source | Directory | The project source code. |
| projectId | string | Google Cloud Project ID. |
| gcpCredentials | File | JSON credentials file for authentication. |
| appId | string (optional) | Firebase App ID. |
| only | string (optional) | Firebase deploy filter (e.g., 'hosting', 'functions'). |
| frontendDir | string (optional) | Path to the frontend directory. |
| backendDir | string (optional) | Path to the backend directory. |
| firebaseDir | string (optional) | Directory containing firebase.json. |
