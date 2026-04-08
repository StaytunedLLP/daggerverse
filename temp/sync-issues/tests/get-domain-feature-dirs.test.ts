import { test } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Verifies the shared getDomainFeatureDirs helper finds domain feature dirs
 */

test("getDomainFeatureDirs returns feature directories", async () => {
  const tmp = join(process.cwd(), "test-src-temp");
  const featDir = join(tmp, "my.domain", "requirement", "features");

  // Ensure clean state
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(featDir, { recursive: true });

  // Import compiled helper from dist (tests run against dist)
  // @ts-ignore: import from compiled lib in dist
  const effects = await import("../lib/effects.js");

  try {
    const dirs = effects.getDomainFeatureDirs(tmp);
    assert.ok(Array.isArray(dirs), "should return an array");
    assert.ok(dirs.includes(featDir), "should include our test feature dir");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
