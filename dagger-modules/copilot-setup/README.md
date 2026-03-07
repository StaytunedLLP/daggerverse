# Copilot Setup

Reusable Dagger module for warming a Node workspace before Copilot starts work.

```bash
dagger call prepare-node-workspace \
  --source . \
  --node-auth-token env:NODE_AUTH_TOKEN \
  --package-paths ".,subproject" \
  --playwright-install
```

Available switches:

- `--playwright-install`
- `--firebase-tools`
