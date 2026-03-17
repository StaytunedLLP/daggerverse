import { DEFAULT_WORKSPACE } from "./constants.js";
import type { PathInput } from "./types.js";

export function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function normalizePaths(value: PathInput | undefined): string[] {
  if (value === undefined) {
    return ["."];
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value : ["."];
  }

  return splitCsv(value).length > 0 ? splitCsv(value) : ["."];
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function resolveWorkspacePath(
  workspace = DEFAULT_WORKSPACE,
  path: string,
): string {
  return path === "." ? workspace : `${workspace}/${path}`;
}
