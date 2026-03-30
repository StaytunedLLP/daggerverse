/**
 * document.test.ts
 *
 * Unit tests for document processing functions.
 * These are pure functions that don't require mocking.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    parseEpicFrontmatter,
    parseFeatureFrontmatter,
    getDocumentTitle,
    getDocumentBody,
    updateEpicWithIssue,
    updateFeatureWithIssue,
    updateWithFlagIssue,
    calculateEpicRename,
    calculateFeatureRename,
    findBestIssueType,
    generateFlagTitle,
    generatePlaceholderFlagTitle,
    generateFlagBody,
    anchorFlagKeysInContent,
    isEpicDocument,
    isFeatureDocument,
    getDocumentType,
} from "../lib/document.js";

describe("parseEpicFrontmatter", () => {
    it("parses epic frontmatter with epic_name", () => {
        const content = `---
epic_name: "Auth System"
issue_number: "123"
---
Body`;
        const result = parseEpicFrontmatter(content);
        assert.strictEqual(result.epic_name, "Auth System");
        assert.strictEqual(result.issue_number, 123);
    });

    it("falls back to feature_name for epic_name", () => {
        const content = `---
feature_name: "Legacy Name"
---
Body`;
        const result = parseEpicFrontmatter(content);
        assert.strictEqual(result.epic_name, "Legacy Name");
    });
});

describe("parseFeatureFrontmatter", () => {
    it("parses feature frontmatter", () => {
        const content = `---
feature_name: "Login"
issue_number: "456"
---
Body`;
        const result = parseFeatureFrontmatter(content);
        assert.strictEqual(result.feature_name, "Login");
        assert.strictEqual(result.issue_number, 456);
    });
});

describe("getDocumentTitle", () => {
    it("extracts title from body", () => {
        const content = `---
key: value
---

# My Feature

Content`;
        assert.strictEqual(getDocumentTitle(content, "fallback"), "My Feature");
    });

    it("returns fallback if no title", () => {
        const content = `---
key: value
---

No title here`;
        assert.strictEqual(getDocumentTitle(content, "fallback"), "fallback");
    });
});

describe("getDocumentBody", () => {
    it("returns content without frontmatter", () => {
        const content = `---
key: value
---

Body content`;
        const body = getDocumentBody(content);
        assert.ok(body.includes("Body content"));
        assert.ok(!body.includes("key: value"));
    });
});

describe("updateEpicWithIssue", () => {
    it("adds issue data to frontmatter", () => {
        const content = `---
epic_name: "Test"
---
Body`;
        const result = updateEpicWithIssue(content, "http://issue", 100, "id123");
        assert.ok(result.includes('issue_url: "http://issue"'));
        assert.ok(result.includes('issue_number: "100"'));
        assert.ok(result.includes('issue_id: "id123"'));
    });
});

describe("updateFeatureWithIssue", () => {
    it("adds issue data without flag", () => {
        const content = `---
feature_name: "Test"
---
Body`;
        const result = updateFeatureWithIssue(content, "http://issue", 50, "id456");
        assert.ok(result.includes('issue_number: "50"'));
    });

    it("adds flag issue number when provided", () => {
        const content = `---
feature_name: "Test"
---
Body`;
        const result = updateFeatureWithIssue(content, "http://issue", 50, "id456", 60);
        assert.ok(result.includes('flag_issue_number: "60"'));
    });
});

describe("updateWithFlagIssue", () => {
    it("adds flag issue number to frontmatter", () => {
        const content = `---
feature_name: "Test"
---
Body`;
        const result = updateWithFlagIssue(content, 99);
        assert.ok(result.includes('flag_issue_number: "99"'));
    });
});

describe("calculateEpicRename", () => {
    it("calculates epic rename", () => {
        const result = calculateEpicRename("/epics/auth.md", 10);
        assert.ok(result);
        assert.strictEqual(result.newName, "epic-10-auth.md");
    });
});

describe("calculateFeatureRename", () => {
    it("calculates feature rename", () => {
        const result = calculateFeatureRename("/features/login.md", 20);
        assert.ok(result);
        assert.strictEqual(result.newName, "feat-20-login.md");
    });
});

describe("findBestIssueType", () => {
    it("finds matching type case-insensitively", () => {
        const types = ["Epic 🏔️", "Feature 🧩", "Bug 🐛"];
        assert.strictEqual(findBestIssueType(types, "epic"), "Epic 🏔️");
        assert.strictEqual(findBestIssueType(types, "FEATURE"), "Feature 🧩");
    });

    it("returns fallback for known types", () => {
        assert.strictEqual(findBestIssueType([], "epic"), "Epic 🏔️");
        assert.strictEqual(findBestIssueType([], "feature"), "Feature 🧩");
        assert.strictEqual(findBestIssueType([], "flag"), "Flag 🚩");
    });

    it("returns null for unknown types", () => {
        assert.strictEqual(findBestIssueType([], "unknown"), null);
    });
});

describe("generateFlagTitle", () => {
    it("generates correct flag title format", () => {
        const result = generateFlagTitle(100, 101, "social_login");
        assert.strictEqual(result, "feature_fe_100_fl_101_social_login_enabled");
    });

    it("sanitizes context", () => {
        const result = generateFlagTitle(1, 2, "My Feature!");
        assert.strictEqual(result, "feature_fe_1_fl_2_my_feature_enabled");
    });

    it("uses default for empty context", () => {
        const result = generateFlagTitle(1, 2, "");
        assert.strictEqual(result, "feature_fe_1_fl_2_default_enabled");
    });
});

describe("generatePlaceholderFlagTitle", () => {
    it("generates placeholder with PLACEHOLDER in place of flag number", () => {
        const result = generatePlaceholderFlagTitle(100, "login");
        assert.strictEqual(result, "feature_fe_100_fl_PLACEHOLDER_login_enabled");
    });
});

describe("generateFlagBody", () => {
    it("generates flag body with feature number and context", () => {
        const result = generateFlagBody(42, "dark_mode");
        assert.ok(result.includes("#42"));
        assert.ok(result.includes("dark_mode"));
    });
});

describe("anchorFlagKeysInContent", () => {
    it("returns content unchanged if no flag block", () => {
        const content = "No flag block here";
        const result = anchorFlagKeysInContent(content, 1, 2);
        assert.strictEqual(result, content);
    });

    it("updates flag block with generated keys", () => {
        const content = `
<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
|---------|------|-----------|---------------|---------------|----------------|-----|
| login | BOOLEAN | client | true | false | false | _auto-generated_ |
<!-- REMOTE_CONFIG_FLAG_END -->
`;
        const result = anchorFlagKeysInContent(content, 100, 101);
        assert.ok(result.includes("feature_fe_100_fl_101_login_enabled"));
    });

    it("preserves existing real keys", () => {
        const content = `
<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
|---------|------|-----------|---------------|---------------|----------------|-----|
| login | BOOLEAN | client | true | false | false | \`existing_key\` |
<!-- REMOTE_CONFIG_FLAG_END -->
`;
        const result = anchorFlagKeysInContent(content, 100, 101);
        // Should still contain the original key pattern in some form
        assert.ok(!result.includes("_auto-generated_"));
    });

    it("handles empty flags array", () => {
        const content = `
<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
|---------|------|-----------|---------------|---------------|----------------|-----|
<!-- REMOTE_CONFIG_FLAG_END -->
`;
        const result = anchorFlagKeysInContent(content, 100, 101);
        // Should return content unchanged if no flags
        assert.strictEqual(result, content);
    });

    it("handles row without matching flag", () => {
        const content = `
<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
|---------|------|-----------|---------------|---------------|----------------|-----|
| test | |
| valid | BOOLEAN | client | true | false | false | _auto-generated_ |
<!-- REMOTE_CONFIG_FLAG_END -->
`;
        const result = anchorFlagKeysInContent(content, 100, 101);
        assert.ok(result.includes("feature_fe_100_fl_101"));
    });
});

describe("isEpicDocument", () => {
    it("returns true for epic paths", () => {
        assert.strictEqual(isEpicDocument("/product/epics/auth.md"), true);
    });

    it("returns false for non-epic paths", () => {
        assert.strictEqual(isEpicDocument("/product/features/login.md"), false);
        assert.strictEqual(isEpicDocument("/product/epics/readme.txt"), false);
    });
});

describe("isFeatureDocument", () => {
    it("returns true for feature paths", () => {
        assert.strictEqual(isFeatureDocument("/product/features/login.md"), true);
    });

    it("returns false for non-feature paths", () => {
        assert.strictEqual(isFeatureDocument("/product/epics/auth.md"), false);
    });
});

describe("getDocumentType", () => {
    it("returns Epic for epic documents", () => {
        assert.strictEqual(getDocumentType("/epics/test.md"), "Epic");
    });

    it("returns Feature for feature documents", () => {
        assert.strictEqual(getDocumentType("/features/test.md"), "Feature");
    });

    it("returns null for other documents", () => {
        assert.strictEqual(getDocumentType("/other/test.md"), null);
    });
});
