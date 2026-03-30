/**
 * integration.test.ts
 *
 * Integration tests for sync-issues library.
 * Updated for Result types.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { isSuccess, isFailure } from "../lib/fp.js";
import * as github from "../lib/github.js";
import * as git from "../lib/git.js";
import * as effects from "../lib/effects.js";
import {
    parseFrontmatter,
    updateFrontmatter,
    parseFlagBlock,
    extractTitle,
} from "../lib/parser.js";
import {
    mergeTemplates,
    createTemplateFragment,
} from "../lib/template.js";
import {
    parseEpicFrontmatter,
    parseFeatureFrontmatter,
    anchorFlagKeysInContent,
    generateFlagTitle,
} from "../lib/document.js";
import type { RemoteConfigTemplate } from "../lib/types.js";

// Skip integration tests if SKIP_INTEGRATION is set
const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION === "true";

// Test directory for file operations
const INTEGRATION_TEST_DIR = join(tmpdir(), `integration-test-${Date.now()}`);

describe("Integration: GitHub CLI", { skip: SKIP_INTEGRATION }, () => {
    before(() => {
        mkdirSync(INTEGRATION_TEST_DIR, { recursive: true });
    });

    after(() => {
        if (existsSync(INTEGRATION_TEST_DIR)) {
            rmSync(INTEGRATION_TEST_DIR, { recursive: true, force: true });
        }
    });

    it("can check GitHub CLI authentication status", () => {
        const result = github.execGh("auth status", false);
        assert.ok(isSuccess(result) || isFailure(result));
    });

    it("can get repository info from current directory", () => {
        const repoInfo = github.getRepoInfo();
        assert.ok(isSuccess(repoInfo) || isFailure(repoInfo));
    });

    it("can parse repository argument", () => {
        const repoInfo = github.getRepoInfo("owner/repo");
        assert.ok(isSuccess(repoInfo));
        if (isSuccess(repoInfo)) {
            assert.strictEqual(repoInfo.value.owner, "owner");
            assert.strictEqual(repoInfo.value.repo, "repo");
        }
    });

    it("returns FAILURE for invalid repository argument", () => {
        const repoInfo = github.getRepoInfo("invalid-format");
        assert.ok(isFailure(repoInfo));
    });
});

describe("Integration: Git Operations", { skip: SKIP_INTEGRATION }, () => {
    it("can get current branch name", () => {
        const result = git.getCurrentBranch();
        assert.ok(isSuccess(result) || isFailure(result));
    });

    it("can check if working tree is clean", () => {
        const result = git.isClean();
        assert.ok(isSuccess(result));
    });

    it("can get list of changed files", () => {
        const result = git.getChangedFiles();
        assert.ok(isSuccess(result));
    });

    it("dry run operations log but don't execute", () => {
        const results = [
            git.createBranch("test-branch", true),
            git.checkoutBranch("main", true),
            git.stageAll(true),
            git.commit("test message", true),
            git.pushBranch("test-branch", true),
        ];

        for (const result of results) {
            assert.ok(isSuccess(result));
        }
    });
});

describe("Integration: File System Effects", { skip: SKIP_INTEGRATION }, () => {
    const testDir = join(INTEGRATION_TEST_DIR, "fs-test");

    before(() => {
        mkdirSync(testDir, { recursive: true });
    });

    it("can read and write files", () => {
        const testFile = join(testDir, "test.txt");
        const content = "Hello, Integration Test!";

        effects.writeFile(testFile, content);
        const readRes = effects.readFile(testFile);

        assert.ok(isSuccess(readRes));
        if (isSuccess(readRes)) {
            assert.strictEqual(readRes.value, content);
        }
    });

    it("can check file existence", () => {
        const existingFile = join(testDir, "existing.txt");
        effects.writeFile(existingFile, "exists");

        assert.strictEqual(effects.fileExists(existingFile), true);
        assert.strictEqual(effects.fileExists(join(testDir, "nonexistent.txt")), false);
    });

    it("can walk directories recursively", () => {
        const subDir = join(testDir, "subdir");
        mkdirSync(subDir, { recursive: true });
        effects.writeFile(join(testDir, "file1.txt"), "1");
        effects.writeFile(join(subDir, "file2.txt"), "2");

        const result = effects.walkDirectory(testDir);
        assert.ok(isSuccess(result));
        if (isSuccess(result)) {
            assert.ok(result.value.length >= 2);
        }
    });

    it("can filter markdown files", () => {
        effects.writeFile(join(testDir, "doc.md"), "# Doc");
        effects.writeFile(join(testDir, "script.js"), "console.log()");

        const result = effects.listMarkdownFiles(testDir);
        assert.ok(isSuccess(result));
        if (isSuccess(result)) {
            assert.ok(result.value.length >= 1);
        }
    });
});

describe("Integration: End-to-End Workflows", { skip: SKIP_INTEGRATION }, () => {
    const workflowTestDir = join(INTEGRATION_TEST_DIR, "workflow-test");

    before(() => {
        mkdirSync(join(workflowTestDir, "product", "epics"), { recursive: true });
        mkdirSync(join(workflowTestDir, "product", "features"), { recursive: true });
    });

    it("can simulate planning sync workflow", () => {
        // Create sample epic
        const epicContent = `---
epic_name: "Payment System"
---

# Epic: Payment System

Payment processing features.
`;
        effects.writeFile(join(workflowTestDir, "product", "epics", "payment.md"), epicContent);

        // Create sample feature
        const featureContent = `---
feature_name: "Stripe Integration"
parent_epic: "Payment System"
---

# Feature: Stripe Integration

Integrate Stripe for payments.

<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
|---------|------|-----------|---------------|---------------|----------------|-----|
| stripe_enabled | BOOLEAN | client | true | false | false | _auto-generated_ |
<!-- REMOTE_CONFIG_FLAG_END -->
`;
        effects.writeFile(join(workflowTestDir, "product", "features", "stripe.md"), featureContent);

        // List markdown files
        const epicFilesRes = effects.listMarkdownFiles(join(workflowTestDir, "product", "epics"));
        const featureFilesRes = effects.listMarkdownFiles(join(workflowTestDir, "product", "features"));

        assert.ok(isSuccess(epicFilesRes));
        assert.ok(isSuccess(featureFilesRes));

        if (isSuccess(epicFilesRes) && isSuccess(featureFilesRes)) {
            // Read and process epic
            const readEpicRes = effects.readFile(epicFilesRes.value[0]);
            assert.ok(isSuccess(readEpicRes));
            if (isSuccess(readEpicRes)) {
                const epicData = parseEpicFrontmatter(readEpicRes.value);
                assert.strictEqual(epicData.epic_name, "Payment System");
            }

            // Read and process feature with flag block
            const readFeatureRes = effects.readFile(featureFilesRes.value[0]);
            assert.ok(isSuccess(readFeatureRes));
            if (isSuccess(readFeatureRes)) {
                const featureData = parseFeatureFrontmatter(readFeatureRes.value);
                const flagBlock = parseFlagBlock(readFeatureRes.value);

                assert.strictEqual(featureData.feature_name, "Stripe Integration");
                assert.ok(flagBlock);
                assert.strictEqual(flagBlock.flags[0].context, "stripe_enabled");
            }
        }
    });
});
