import { execFileSync } from "node:child_process";

function firebase(args: string[], stdio: "inherit" | ["ignore", "pipe", "pipe"] = [
  "ignore",
  "pipe",
  "pipe",
]): string {
  return execFileSync("firebase", args, {
    encoding: "utf8",
    stdio,
  });
}

function getBackend(projectId: string, backendId: string) {
  try {
    const raw = firebase([
      "apphosting:backends:get",
      backendId,
      "--project",
      projectId,
      "--json",
    ]);
    return { exists: true, payload: JSON.parse(raw) as Record<string, unknown> };
  } catch (error) {
    return { exists: false, error };
  }
}

function getBackendUrl(payload: Record<string, unknown> | undefined): string | null {
  if (!payload) {
    return null;
  }

  if (typeof payload.url === "string" && payload.url.length > 0) {
    return payload.url;
  }

  const result = payload.result;
  if (result && typeof result === "object") {
    const maybeUrl = (result as { url?: unknown }).url;
    if (typeof maybeUrl === "string" && maybeUrl.length > 0) {
      return maybeUrl;
    }
  }

  if (typeof payload.uri === "string" && payload.uri.length > 0) {
    return payload.uri;
  }

  return null;
}

const projectId = process.env.APPHOSTING_PROJECT_ID?.trim() ?? "";
const backendId = process.env.APPHOSTING_BACKEND_ID?.trim() ?? "";
const configPath = process.env.APPHOSTING_CONFIG_PATH?.trim() ?? "";
const skipDeploy = process.env.APPHOSTING_SKIP_DEPLOY === "true";
const allowMissing = process.env.APPHOSTING_ALLOW_MISSING === "true";
const createBackend = process.env.APPHOSTING_CREATE_BACKEND === "true";
const deletePreviewBackend =
  process.env.APPHOSTING_DELETE_PREVIEW_BACKEND === "true";
const appId = process.env.APPHOSTING_APP_ID?.trim() ?? "";
const region = process.env.APPHOSTING_REGION?.trim() || "asia-southeast1";

if (!projectId) {
  throw new Error("projectId is required");
}

if (!backendId) {
  throw new Error("backendId is required");
}

const initial = getBackend(projectId, backendId);
let action = "skipped";
let message = "";
let serviceUrl = initial.exists ? getBackendUrl(initial.payload) : null;

if (deletePreviewBackend) {
  if (initial.exists) {
    firebase(
      ["apphosting:backends:delete", backendId, "--project", projectId, "--force"],
      "inherit",
    );
    action = "deleted";
    message = `Deleted App Hosting backend ${backendId}.`;
    serviceUrl = null;
  } else {
    message = `Backend ${backendId} does not exist; nothing to delete.`;
  }
} else if (skipDeploy) {
  message = `Skipped deploy for App Hosting backend ${backendId}.`;
} else {
  if (!initial.exists && createBackend) {
    if (!appId) {
      throw new Error("appId is required when createPreviewBackend is enabled");
    }

    firebase(
      [
        "apphosting:backends:create",
        "--backend",
        backendId,
        "--project",
        projectId,
        "--primary-region",
        region,
        "--app",
        appId,
      ],
      "inherit",
    );
  }

  if (!initial.exists && !allowMissing && !createBackend) {
    throw new Error(
      `Backend ${backendId} not found in project ${projectId}. Create it first or enable backend creation.`,
    );
  }

  if (!configPath) {
    throw new Error("APPHOSTING_CONFIG_PATH is required");
  }

  firebase(
    [
      "deploy",
      "--only",
      `apphosting:${backendId}`,
      "--config",
      configPath,
      "--project",
      projectId,
      "--non-interactive",
      "--force",
    ],
    "inherit",
  );

  const resolved = getBackend(projectId, backendId);
  serviceUrl = resolved.exists ? getBackendUrl(resolved.payload) : null;
  action = "deployed";
  message = initial.exists
    ? `Deployed App Hosting backend ${backendId}.`
    : `Created and deployed App Hosting backend ${backendId}.`;
}

process.stdout.write(
  JSON.stringify({
    action,
    backendId,
    projectId,
    serviceUrl,
    backendExisted: initial.exists,
    message,
  }),
);
