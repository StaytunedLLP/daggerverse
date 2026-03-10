# Copilot Setup

Reusable Dagger module for warming a Node workspace before Copilot starts work.

```bash
dagger call prepare-node-workspace \
  --source . \
  --node-auth-token env:NODE_AUTH_TOKEN \
  --package-paths ".,subproject" \
  --playwright-install
```

To persist the prepared workspace back onto the runner filesystem for an agent session,
export the directory result from the new `prepare-node-workspace-directory` function:

```bash
dagger call --output ./copilot-prepared prepare-node-workspace-directory \
  --source . \
  --node-auth-token env:NODE_AUTH_TOKEN \
  --package-paths ".,sl-demos" \
  --build-paths ".,sl-demos" \
  --playwright-install
```

Available switches:

- `--playwright-install`
- `--firebase-tools`
