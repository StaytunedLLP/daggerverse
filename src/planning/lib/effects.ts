/**
 * effects.ts
 *
 * Shell wrappers for I/O operations (impure functions).
 * This module isolates all side effects from pure logic.
 * All functions return Result types.
 */

import { execSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  rmSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { type Result, success, failure, pipe, map, flatMap } from "./fp.js";
import type { RemoteConfigTemplate, FirebaseNamespace } from "./types.js";
import { NAMESPACE_MAP } from "./types.js";

// ============================================================================
// Types
// ============================================================================

export type EffectError =
  | {
      readonly _tag: "FsError";
      readonly message: string;
      readonly path: string;
    }
  | {
      readonly _tag: "ExecError";
      readonly message: string;
      readonly command: string;
      readonly stdout?: string;
      readonly stderr?: string;
    }
  | { readonly _tag: "AuthError"; readonly message: string };

// ============================================================================
// File System Operations
// ============================================================================

/**
 * Read file content as UTF-8 string.
 */
export const readFile = (path: string): Result<EffectError, string> => {
  try {
    return success(readFileSync(path, "utf8"));
  } catch (e) {
    return failure({
      _tag: "FsError",
      message: (e as Error).message,
      path,
    } as EffectError);
  }
};

/**
 * Write content to file.
 */
export const writeFile = (
  path: string,
  content: string,
): Result<EffectError, void> => {
  try {
    writeFileSync(path, content, "utf8");
    return success(undefined);
  } catch (e) {
    return failure({
      _tag: "FsError",
      message: (e as Error).message,
      path,
    } as EffectError);
  }
};

/**
 * Delete a file.
 */
export const deleteFile = (path: string): Result<EffectError, void> => {
  try {
    if (existsSync(path)) {
      rmSync(path, { force: true });
    }
    return success(undefined);
  } catch (e) {
    return failure({
      _tag: "FsError",
      message: (e as Error).message,
      path,
    } as EffectError);
  }
};

/**
 * Rename a file or directory.
 */
export const renameFile = (
  oldPath: string,
  newPath: string,
): Result<EffectError, void> => {
  try {
    renameSync(oldPath, newPath);
    return success(undefined);
  } catch (e) {
    return failure({
      _tag: "FsError",
      message: (e as Error).message,
      path: oldPath,
    } as EffectError);
  }
};

/**
 * Check if a file or directory exists.
 */
export const fileExists = (path: string): boolean => existsSync(path);

/**
 * Recursively walk a directory and collect all file paths.
 */
export const walkDirectory = (
  dir: string,
): Result<EffectError, readonly string[]> => {
  if (!existsSync(dir)) return success([]);

  const result: string[] = [];

  const walk = (currentDir: string): Result<EffectError, void> => {
    try {
      for (const entry of readdirSync(currentDir)) {
        const fullPath = join(currentDir, entry);
        if (statSync(fullPath).isDirectory()) {
          const res = walk(fullPath);
          if (res._tag === "Failure") return res;
        } else {
          result.push(fullPath);
        }
      }
      return success(undefined);
    } catch (e) {
      return failure({
        _tag: "FsError",
        message: (e as Error).message,
        path: currentDir,
      } as EffectError);
    }
  };

  const res = walk(dir);
  return res._tag === "Failure" ? res : success(result);
};

/**
 * List markdown files in a directory (recursive).
 */
export const listMarkdownFiles = (
  dir: string,
): Result<EffectError, readonly string[]> =>
  pipe(
    walkDirectory(dir),
    map((files) => files.filter((f) => f.endsWith(".md"))),
  );

/**
 * Find all domain feature directories under `srcRoot` (defaults to process.cwd()/src)
 */
export const getDomainFeatureDirs = (srcRoot?: string): string[] => {
  const root = srcRoot || join(process.cwd(), "src");
  if (!existsSync(root)) return [];

  const entries = readdirSync(root, { withFileTypes: true });
  const featureDirs: string[] = [];

  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      entry.name !== "requirement" &&
      entry.name !== "shared"
    ) {
      const featDir = join(root, entry.name, "requirement", "features");
      if (existsSync(featDir)) {
        featureDirs.push(featDir);
      }
    }
  }

  return featureDirs;
};

// ============================================================================
// Shell Command Execution
// ============================================================================

/**
 * Execute a shell command and return stdout.
 */
export const execCommand = (cmd: string): Result<EffectError, string> => {
  try {
    const stdout = execSync(cmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return success(stdout);
  } catch (e) {
    const error = e as Error & { stdout?: string; stderr?: string };
    return failure({
      _tag: "ExecError",
      message: error.message,
      command: cmd,
      stdout: error.stdout,
      stderr: error.stderr,
    } as EffectError);
  }
};

/**
 * Execute a shell command silently (suppress output).
 */
export const execCommandSilent = (cmd: string): Result<EffectError, void> => {
  try {
    execSync(cmd, { stdio: "pipe" });
    return success(undefined);
  } catch (e) {
    return failure({
      _tag: "ExecError",
      message: (e as Error).message,
      command: cmd,
    } as EffectError);
  }
};

// ============================================================================
// GCloud & Firebase Operations
// ============================================================================

/**
 * Get GCloud access token for authenticated requests.
 */
export const getAccessToken = (): Result<EffectError, string> =>
  pipe(
    execCommand("gcloud auth application-default print-access-token"),
    flatMap((token) =>
      token
        ? success(token)
        : failure({
            _tag: "AuthError",
            message: "Empty token returned",
          } as EffectError),
    ),
  );

/**
 * Path to Firebase Remote Config skill scripts.
 */
const getSkillsDir = (): string =>
  join(process.cwd(), ".agents/skills/firebase-remote-config/scripts");

/**
 * Fetch Remote Config template from Firebase.
 */
export const fetchTemplate = (
  projectId: string,
  namespace: FirebaseNamespace,
  accessToken: string,
): Result<EffectError, RemoteConfigTemplate> => {
  const outputFile = `/tmp/template_${projectId}.json`;
  const fetchScript = join(getSkillsDir(), "fetch-template.sh");

  return pipe(
    execCommandSilent(
      `bash "${fetchScript}" "${accessToken}" "${projectId}" "${namespace}" "${outputFile}"`,
    ),
    flatMap(() => readFile(outputFile)),
    flatMap((content) => {
      try {
        return success(JSON.parse(content) as RemoteConfigTemplate);
      } catch (e) {
        return failure({
          _tag: "FsError",
          message: "Failed to parse template JSON",
          path: outputFile,
        } as EffectError);
      }
    }),
  );
};

/**
 * Publish Remote Config template to Firebase.
 */
export const publishTemplate = (
  projectId: string,
  template: RemoteConfigTemplate,
  namespace: FirebaseNamespace,
  accessToken: string,
): Result<EffectError, void> => {
  const templateFile = `/tmp/template_publish_${projectId}.json`;
  const publishScript = join(getSkillsDir(), "publish-template.sh");

  const { version: _, ...templateWithoutVersion } = template;

  return pipe(
    writeFile(templateFile, JSON.stringify(templateWithoutVersion, null, 2)),
    flatMap(() =>
      execCommandSilent(
        `bash "${publishScript}" "${accessToken}" "${projectId}" "${namespace}" "*" "${templateFile}"`,
      ),
    ),
    map(() => {
      console.log(`✅ Published template to ${projectId}`);
      return undefined;
    }),
  );
};

// ============================================================================
// GitHub CLI Operations
// ============================================================================

/**
 * Find a GitHub issue by title search.
 */
export const findIssueByTitle = (
  searchTerm: string,
): Result<EffectError, { number: number; title: string } | null> => {
  const query = searchTerm.replace(/_/g, " ");
  return pipe(
    execCommand(
      `gh issue list --search "${query}" --json number,title -s all --limit 10`,
    ),
    flatMap((result) => {
      try {
        const issues = JSON.parse(result) as {
          number: number;
          title: string;
        }[];
        return success(
          issues.find((i) => i.title.includes(searchTerm)) || null,
        );
      } catch {
        return failure({
          _tag: "FsError",
          message: "Failed to parse issue list search result",
          path: "gh-cli-output",
        } as EffectError);
      }
    }),
  );
};

/**
 * Close a GitHub issue with a comment.
 */
export const closeIssue = (
  issueNumber: number,
  comment: string,
): Result<EffectError, void> =>
  pipe(
    execCommandSilent(
      `gh issue close ${issueNumber} --reason completed --comment "${comment}"`,
    ),
    map(() => undefined),
  );

// ============================================================================
// Logging
// ============================================================================

export const log = {
  info: (msg: string): void => console.log(msg),
  success: (msg: string): void => console.log(`✅ ${msg}`),
  error: (msg: string): void => console.error(`❌ ${msg}`),
  warn: (msg: string): void => console.warn(`⚠️ ${msg}`),
  skip: (msg: string): void => console.log(`\n⏭️ ${msg}`),
  section: (msg: string): void => console.log(`\n📦 ${msg}`),
  divider: (): void => console.log("=".repeat(50)),
};

/**
 * Resolve a namespace alias to Firebase API namespace.
 */
export const resolveNamespace = (
  alias: "client" | "server",
): FirebaseNamespace => NAMESPACE_MAP[alias];
