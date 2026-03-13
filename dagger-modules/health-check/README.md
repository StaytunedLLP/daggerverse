# Health Check

Reusable Dagger module for repository-specific validation pipelines.

## Generic Node Checks

```bash
dagger call node-checks \
  --source . \
  --node-auth-token env:NODE_AUTH_TOKEN \
  --package-paths ".,subproject" \
  --format \
  --lint \
  --build
```

Available switches:

- `--format`
- `--lint`
- `--test`
- `--build`
- `--verify-chromium-bidi`
