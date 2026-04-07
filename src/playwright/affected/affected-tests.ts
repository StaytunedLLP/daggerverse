import { readFileSync } from "node:fs";

export const internalAffectedSelectorCommand = "__internal_affected_selectors__";
export const listPackagesSelectorMode = "--list";
export const listTestsSelectorMode = "--list-tests";
export const listTestsAllSelectorMode = "--list-tests-all";

function encodeJsString(value: string): string {
  return JSON.stringify(value);
}

function normalizeSelectorMode(selectorMode: string): string {
  const mode = selectorMode.trim().length > 0 ? selectorMode.trim() : listTestsSelectorMode;
  const validModes = [
    listPackagesSelectorMode,
    listTestsSelectorMode,
    listTestsAllSelectorMode,
  ];

  if (!validModes.includes(mode)) {
    throw new Error(
      `Unsupported selectorMode '${selectorMode}'. Supported values: ${validModes.join(", ")}.`,
    );
  }

  return mode;
}

function readRuntimeProgram(): string {
  try {
    return readFileSync(new URL("./affected-selectors.runtime.ts", import.meta.url), "utf8");
  } catch {
    return readFileSync(new URL("./affected-selectors.runtime.js", import.meta.url), "utf8");
  }
}

const internalAffectedSelectorProgram = readRuntimeProgram();

function buildInternalProgram(mode: string, base: string): string {
  return internalAffectedSelectorProgram
    .replace('"__SELECTOR_MODE__"', encodeJsString(mode))
    .replace('"__BASE_REF__"', encodeJsString(base));
}

/**
 * Builds a Node program that computes affected selectors.
 *
 * Supported selector modes:
 * - --list-tests (default): prints test directory selectors separated by whitespace
 * - --list: prints affected package paths separated by commas
 * - --list-tests-all: prints all affected test directories regardless of diff
 */
export function buildInternalSelectorProgram(base: string, selectorMode: string): string {
  const mode = normalizeSelectorMode(selectorMode);
  return buildInternalProgram(mode, base);
}
