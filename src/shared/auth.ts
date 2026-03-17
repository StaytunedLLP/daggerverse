import { Secret, dag } from "@dagger.io/dagger";

const DEFAULT_NODE_AUTH_SECRET_NAME = "node-auth-token";

export function maybeResolveNodeAuthToken(nodeAuthToken?: Secret): Secret | undefined {
  if (nodeAuthToken) {
    return nodeAuthToken;
  }

  const token = process.env.NODE_AUTH_TOKEN ?? process.env.GITHUB_TOKEN;

  if (!token || token.trim().length === 0) {
    return undefined;
  }

  return dag.setSecret(DEFAULT_NODE_AUTH_SECRET_NAME, token);
}

export function resolveNodeAuthToken(nodeAuthToken?: Secret): Secret {
  const token = maybeResolveNodeAuthToken(nodeAuthToken);

  if (!token) {
    throw new Error(
      "NODE_AUTH_TOKEN or GITHUB_TOKEN must be set, or nodeAuthToken must be provided.",
    );
  }

  return token;
}
