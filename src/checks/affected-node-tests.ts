import { readFileSync } from "node:fs";

export const listTestsSelectorMode = "--list-tests";

function encodeJsString(value: string): string {
  return JSON.stringify(value);
}

function readRuntimeProgram(): string {
  try {
    return readFileSync(new URL("./affected-node-tests.runtime.ts", import.meta.url), "utf8");
  } catch {
    return readFileSync(new URL("./affected-node-tests.runtime.js", import.meta.url), "utf8");
  }
}

const internalAffectedSelectorProgram = readRuntimeProgram();

function buildInternalProgram(mode: string, base: string): string {
  return internalAffectedSelectorProgram
    .replace('"__BASE_REF__"', encodeJsString(base));
}

/**
 * Builds a Node program that computes affected tests.
 */
export function buildInternalSelectorProgram(base: string, selectorMode: string = listTestsSelectorMode): string {
  return buildInternalProgram(selectorMode, base);
}
