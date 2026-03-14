import { Secret, dag } from "@dagger.io/dagger";

const DEFAULT_NODE_AUTH_SECRET_NAME = "node-auth-token";

export function resolveNodeAuthToken(nodeAuthToken?: Secret): Secret {
  if (nodeAuthToken) {
    return nodeAuthToken;
  }

  const token = process.env.NODE_AUTH_TOKEN ?? process.env.GITHUB_TOKEN;

  if (!token || token.trim().length === 0) {
    throw new Error(
      "NODE_AUTH_TOKEN or GITHUB_TOKEN must be set, or nodeAuthToken must be provided.",
    );
  }

  return dag.setSecret(DEFAULT_NODE_AUTH_SECRET_NAME, token);
}
