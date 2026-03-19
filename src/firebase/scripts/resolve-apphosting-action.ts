import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
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

function withProjectArgs(projectId: string): string[] {
  return projectId ? ["--project", projectId] : [];
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
      ...withProjectArgs(projectId),
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

function resolveBackendFromConfig(configPath: string): string {
  if (!configPath) {
    return "";
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as {
      apphosting?: Array<{ backendId?: string }>;
    };
    return parsed.apphosting?.[0]?.backendId?.trim() ?? "";
  } catch {
    return "";
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

function readCliArg(name: string): string | undefined {
  const target = `--${name}`;
  const index = process.argv.indexOf(target);

  if (index < 0) {
    return undefined;
  }

  const value = process.argv[index + 1];
  return typeof value === "string" ? value.trim() : undefined;
}

function readCliBoolean(name: string): boolean | undefined {
  const raw = readCliArg(name);
  if (raw === undefined || raw === "") {
    return undefined;
  }

  return raw.toLowerCase() === "true";
}

const projectId =
  readCliArg("project-id") ?? process.env.APPHOSTING_PROJECT_ID?.trim() ?? "";
const backendId =
  readCliArg("backend-id") ?? process.env.APPHOSTING_BACKEND_ID?.trim() ?? "";
const configPath =
  readCliArg("config-path") ?? process.env.APPHOSTING_CONFIG_PATH?.trim() ?? "";
const skipDeploy =
  readCliBoolean("skip-deploy") ??
  process.env.APPHOSTING_SKIP_DEPLOY === "true";
const allowMissing =
  readCliBoolean("allow-missing") ??
  process.env.APPHOSTING_ALLOW_MISSING === "true";
const createBackend =
  readCliBoolean("create-backend") ??
  process.env.APPHOSTING_CREATE_BACKEND === "true";
const deletePreviewBackend =
  readCliBoolean("delete-preview-backend") ??
  process.env.APPHOSTING_DELETE_PREVIEW_BACKEND === "true";
const appId =
  readCliArg("app-id") ?? process.env.APPHOSTING_APP_ID?.trim() ?? "";
const region =
  readCliArg("region") ??
  (process.env.APPHOSTING_REGION?.trim() || "asia-southeast1");

try {
  const resolvedBackendId = backendId || resolveBackendFromConfig(configPath);

  if (!resolvedBackendId) {
    throw new Error("backendId is required");
  }

  const initial = getBackend(projectId, resolvedBackendId);
  let action = "skipped";
  let message = "";
  let serviceUrl = initial.exists ? getBackendUrl(initial.payload) : null;

  if (deletePreviewBackend) {
    if (initial.exists) {
      firebase([
        "apphosting:backends:delete",
        resolvedBackendId,
        ...withProjectArgs(projectId),
        "--force",
      ]);
      action = "deleted";
      message = `Deleted App Hosting backend ${resolvedBackendId}.`;
      serviceUrl = null;
    } else {
      message = `Backend ${resolvedBackendId} does not exist; nothing to delete.`;
    }
  } else if (skipDeploy) {
    message = `Skipped deploy for App Hosting backend ${resolvedBackendId}.`;
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
        resolvedBackendId,
        ...withProjectArgs(projectId),
        "--primary-region",
        region,
        "--app",
        appId,
      ]);
    }

    if (!initial.exists && !allowMissing && !createBackend) {
      throw new Error(
        `Backend ${resolvedBackendId} not found${projectId ? ` in project ${projectId}` : ""}. Create it first or enable backend creation.`,
      );
    }

    if (!configPath) {
      throw new Error("APPHOSTING_CONFIG_PATH is required");
    }

    firebase([
      "deploy",
      "--only",
      `apphosting:${resolvedBackendId}`,
      "--config",
      configPath,
      ...withProjectArgs(projectId),
      "--non-interactive",
      "--force",
    ]);

    const resolved = getBackend(projectId, resolvedBackendId);
    serviceUrl = resolved.exists ? getBackendUrl(resolved.payload) : null;
    action = "deployed";
    message =
      initial.exists ?
        `Deployed App Hosting backend ${resolvedBackendId}.`
      : `Created and deployed App Hosting backend ${resolvedBackendId}.`;
  }

  process.stdout.write(
    JSON.stringify({
      action,
      backendId: resolvedBackendId,
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
      debug: {
        argv: process.argv,
        envProjectId: process.env.APPHOSTING_PROJECT_ID ?? null,
        envBackendId: process.env.APPHOSTING_BACKEND_ID ?? null,
        envConfigPath: process.env.APPHOSTING_CONFIG_PATH ?? null,
      },
    }),
  );
}
