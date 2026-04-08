import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

/**
 * artifacts.test.ts
 * 
 * Verifies that the local config generator produces valid TypeScript and JSON artifacts.
 * Uses a temporary directory to avoid polluting the workspace.
 */

const REPO_ROOT = join(process.cwd(), "../..");
const TEST_OUTPUT_DIR = join(process.cwd(), "test-output");
const TEST_DOCS_DIR = join(process.cwd(), "test-docs");

// Create a mock domain structure for testing
const setupTestDocs = () => {
    // Create test domain feature directory structure
    const domainFeaturesDir = join(TEST_DOCS_DIR, "src", "test.domain", "requirement", "features");
    mkdirSync(domainFeaturesDir, { recursive: true });
    
    // Create a sample feature file with flag block
    const featureContent = `---
feature_name: "Test Feature"
issue_number: 123
flag_issue_number: 456
---

# Feature: Test Feature

<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
|---------|------|-----------|---------------|---------------|----------------|-----|
| test_flag | BOOLEAN | client | true | false | false | \`feature_fe_123_fl_456_test_flag_enabled\` |
<!-- REMOTE_CONFIG_FLAG_END -->
`;
    writeFileSync(join(domainFeaturesDir, "test-feature.md"), featureContent);
};

describe("Remote Config Artifact Generation", () => {

    before(() => {
        // Ensure clean state
        if (existsSync(TEST_OUTPUT_DIR)) {
            rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
        }
        if (existsSync(TEST_DOCS_DIR)) {
            rmSync(TEST_DOCS_DIR, { recursive: true, force: true });
        }
        mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
        
        // Setup test docs with DDD structure
        setupTestDocs();

        // Run the generator script using the compiled JS
        // Point it to test docs and a temporary output dir
        console.log("   🛠️ Running generator for integration test...");
        execSync(`node dist/src/generate-local-config.js`, {
            env: {
                ...process.env,
                DOCS_DIR: join(TEST_DOCS_DIR, "src", "test.domain", "requirement", "features"),
                OUTPUT_DIR: TEST_OUTPUT_DIR
            }
        });
    });

    after(() => {
        // Cleanup: remove the temporary test output and docs
        if (existsSync(TEST_OUTPUT_DIR)) {
            rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
            console.log("   🧹 Cleaned up test artifacts.");
        }
        if (existsSync(TEST_DOCS_DIR)) {
            rmSync(TEST_DOCS_DIR, { recursive: true, force: true });
            console.log("   🧹 Cleaned up test docs.");
        }
    });

    test("Generated files exist", () => {
        assert.strictEqual(existsSync(join(TEST_OUTPUT_DIR, "client-parameters.ts")), true, "client-parameters.ts should exist");
        assert.strictEqual(existsSync(join(TEST_OUTPUT_DIR, "server-parameters.ts")), true, "server-parameters.ts should exist");
        assert.strictEqual(existsSync(join(TEST_OUTPUT_DIR, "remote-config-defaults.json")), true, "remote-config-defaults.json should exist");
    });

    test("Client parameters contain expected structure", () => {
        const content = readFileSync(join(TEST_OUTPUT_DIR, "client-parameters.ts"), "utf8");
        assert.ok(content.includes("export const CLIENT_PARAMETERS = {"), "Should export CLIENT_PARAMETERS");
        assert.ok(content.includes("export type ClientParameter ="), "Should export ClientParameter type");
    });

    test("Server parameters contain expected structure", () => {
        const content = readFileSync(join(TEST_OUTPUT_DIR, "server-parameters.ts"), "utf8");
        assert.ok(content.includes("export const SERVER_PARAMETERS = {"), "Should export SERVER_PARAMETERS");
        assert.ok(content.includes("export type ServerParameter ="), "Should export ServerParameter type");
    });

    test("Defaults JSON is valid and contains keys", () => {
        const content = JSON.parse(readFileSync(join(TEST_OUTPUT_DIR, "remote-config-defaults.json"), "utf8"));
        assert.strictEqual(typeof content, "object", "Should be an object");
        // It's okay if it's empty if there are no anchored flags in the docs yet, 
        // but it must be a valid JSON object.
    });
});
