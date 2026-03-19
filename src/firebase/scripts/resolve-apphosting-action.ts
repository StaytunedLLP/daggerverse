import { execFileSync } from "node:child_process";

declare const process: {
  env: Record<string, string | undefined>;
  stdout: { write: (value: string) => void };
};

type FirebaseResult = {
  stdout: string;
  stderr: string;
};

function runFirebase(args: string[]): FirebaseResult {
  const command = `firebase ${args.join(" ")}`;

  try {
    const stdout = execFileSync("firebase", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    return {
      stdout,
      stderr: "",
    };
  } catch (error: any) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    const status =
      typeof error?.status === "number" ? ` (exit ${error.status})` : "";

    throw new Error(
      [
        `Firebase CLI command failed${status}: ${command}`,
        stdout ? `stdout:\n${stdout.trim()}` : "",
        stderr ? `stderr:\n${stderr.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }
}

function firebase(args: string[]): string {
  return runFirebase(args).stdout;
}

function isBackendMissingMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("not found") ||
    normalized.includes("404") ||
    (normalized.includes("resource") && normalized.includes("does not exist"))
  );
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
    return {
      exists: true,
      payload: JSON.parse(raw) as Record<string, unknown>,
    };
  } catch (error: any) {
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown error");

    if (isBackendMissingMessage(message)) {
      return { exists: false, error };
    }

    throw new Error(
      `Unable to query App Hosting backend '${backendId}' in project '${projectId}'.\n${message}`,
    );
  }
}

function getBackendUrl(
  payload: Record<string, unknown> | undefined,
): string | null {
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

try {
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
      firebase([
        "apphosting:backends:delete",
        backendId,
        "--project",
        projectId,
        "--force",
      ]);
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
        throw new Error(
          "appId is required when createPreviewBackend is enabled",
        );
      }

      firebase([
        "apphosting:backends:create",
        "--backend",
        backendId,
        "--project",
        projectId,
        "--primary-region",
        region,
        "--app",
        appId,
      ]);
    }

    if (!initial.exists && !allowMissing && !createBackend) {
      throw new Error(
        `Backend ${backendId} not found in project ${projectId}. Create it first or enable backend creation.`,
      );
    }

    if (!configPath) {
      throw new Error("APPHOSTING_CONFIG_PATH is required");
    }

    firebase([
      "deploy",
      "--only",
      `apphosting:${backendId}`,
      "--config",
      configPath,
      "--project",
      projectId,
      "--non-interactive",
      "--force",
    ]);

    const resolved = getBackend(projectId, backendId);
    serviceUrl = resolved.exists ? getBackendUrl(resolved.payload) : null;
    action = "deployed";
    message =
      initial.exists ?
        `Deployed App Hosting backend ${backendId}.`
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
} catch (error: any) {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

  process.stdout.write(
    JSON.stringify({
      action: "failed",
      backendId,
      projectId,
      serviceUrl: null,
      backendExisted: null,
      message,
    }),
  );
}
