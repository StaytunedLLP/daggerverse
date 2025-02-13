# DenoDeploy Module

## Overview

The `DenoDeploy` module provides functionality to deploy projects to Deno Deploy
using the deployctl tool. It includes a function to run the deployment process
with specified parameters such as source directory, authentication token,
project name, organization, entry point file, and deployment mode (production or
preview).

## Prerequisites

### CI/CD

To use the `DenoDeploy` module in your CI/CD pipeline, you need to store the
`DENO_DEPLOY_TOKEN` as a secret in your CI/CD environment. This token is used
for authentication with the Deno Deploy service.

1. **Store the Token**: Add the `DENO_DEPLOY_TOKEN` as a secret in your CI/CD
   environment (e.g., GitHub Actions, GitLab CI, etc.).
2. **Pass the Token**: Pass the token in the `token` field when calling the
   `runDeployctl` function.

Example for GitHub Actions:

```yaml
jobs:
    deploy:
        runs-on: ubuntu-latest
        steps:
            - name: Checkout code
              uses: actions/checkout@v2
            - name: Deploy to Deno
              env:
                  DENO_DEPLOY_TOKEN: ${{ secrets.DENO_DEPLOY_TOKEN }}
```

### Local Development

For local development, you need to set the `DENO_DEPLOY_TOKEN` in your terminal
and pass it as an environment variable when running the deployment command.

1. **Set the Token**: Set the `DENO_DEPLOY_TOKEN` in your terminal.

```sh
export DENO_DEPLOY_TOKEN=your_token_here
```

2. **Pass the Token**: Pass the token as an environment variable when running
   the deployment command.

```sh
dagger call <YOUR_COMMAND_HERE> --token=env:DENO_DEPLOY_TOKEN
```
