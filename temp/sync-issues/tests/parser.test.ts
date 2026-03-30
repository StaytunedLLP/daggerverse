/**
 * parser.test.ts
 *
 * Unit tests for parsing functions.
 * Uses native Node.js test runner.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    parseFrontmatter,
    updateFrontmatter,
    extractTitle,
    parseFlagBlock,
    extractFlagKeysFromContent,
    extractFlagKeysFromBlock,
    updateRowWithKey,
    rebuildFlagBlock,
} from "../lib/parser.js";

describe("parseFrontmatter", () => {
    it("parses simple frontmatter", () => {
        const content = `---
feature_name: "Test Feature"
status: "draft"
---

# Feature: Test`;

        const result = parseFrontmatter(content);

        assert.strictEqual(result.data.feature_name, "Test Feature");
        assert.strictEqual(result.data.status, "draft");
        assert.ok(result.body.includes("# Feature: Test"));
    });

    it("parses numeric values", () => {
        const content = `---
issue_number: "123"
flag_issue_number: "456"
---

Body`;

        const result = parseFrontmatter(content);

        assert.strictEqual(result.data.issue_number, 123);
        assert.strictEqual(result.data.flag_issue_number, 456);
    });

    it("returns empty data for content without frontmatter", () => {
        const content = "# Just a header\n\nSome content";

        const result = parseFrontmatter(content);

        assert.deepStrictEqual(result.data, {});
        assert.strictEqual(result.body, content);
    });

    it("handles quoted values", () => {
        const content = `---
feature_name: "Quoted Value"
status: 'Single Quoted'
---

Body`;

        const result = parseFrontmatter(content);

        assert.strictEqual(result.data.feature_name, "Quoted Value");
        assert.strictEqual(result.data.status, "Single Quoted");
    });

    it("skips lines without colons", () => {
        const content = `---
key: value
invalid line
---
Body`;
        const result = parseFrontmatter(content);
        assert.strictEqual((result.data as any).key, "value");
        assert.strictEqual(Object.keys(result.data).length, 1);
    });

    it("handles non-number keys with numbers", () => {
        const content = `---
count: 123
---
Body`;
        const result = parseFrontmatter(content);
        assert.strictEqual((result.data as any).count, "123");
    });

    it("handles number key with invalid number", () => {
        const content = `---
issue_number: "abc"
---
Body`;
        const result = parseFrontmatter(content);
        assert.strictEqual(result.data.issue_number, "abc");
    });

    it("skips empty keys or values", () => {
        const content = `---
: empty_key
empty_value: 
---
Body`;
        const result = parseFrontmatter(content);
        assert.deepStrictEqual(result.data, {});
    });

    it("skips if value is empty string after trimming", () => {
        const content = `---
key: ""
---
Body`;
        const result = parseFrontmatter(content);
        assert.deepStrictEqual(result.data, {});
    });
});

describe("updateFrontmatter", () => {
    it("adds new fields to frontmatter", () => {
        const content = `---
feature_name: "Test"
---

Body`;

        const result = updateFrontmatter(content, { flag_key: "test_key" });

        assert.ok(result.includes('flag_key: "test_key"'));
        assert.ok(result.includes('feature_name: "Test"'));
    });

    it("updates existing fields", () => {
        const content = `---
status: "draft"
---

Body`;

        const result = updateFrontmatter(content, { status: "approved" });

        assert.ok(result.includes('status: "approved"'));
        assert.ok(!result.includes('status: "draft"'));
    });
});

describe("extractTitle", () => {
    it("extracts H1 title", () => {
        const body = "# My Feature\n\nSome content";
        assert.strictEqual(extractTitle(body, "fallback"), "My Feature");
    });

    it("extracts title with Feature: prefix", () => {
        const body = "# Feature: Social Login\n\nContent";
        assert.strictEqual(extractTitle(body, "fallback"), "Social Login");
    });

    it("extracts title with Epic: prefix", () => {
        const body = "# Epic: Big Project\n\nContent";
        assert.strictEqual(extractTitle(body, "fallback"), "Big Project");
    });

    it("returns fallback when no title", () => {
        const body = "Some content without header";
        assert.strictEqual(extractTitle(body, "fallback"), "fallback");
    });
});

describe("parseFlagBlock", () => {
    it("parses valid flag block", () => {
        const content = `
Some content

<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
|---------|------|-----------|---------------|---------------|----------------|-----|
| social_login | BOOLEAN | client | true | false | false | _auto-generated_ |
<!-- REMOTE_CONFIG_FLAG_END -->

More content`;

        const result = parseFlagBlock(content);

        assert.ok(result);
        assert.strictEqual(result?.flags.length, 1);
        assert.strictEqual(result?.flags[0]?.context, "social_login");
        assert.strictEqual(result?.flags[0]?.type, "BOOLEAN");
        assert.strictEqual(result?.flags[0]?.namespace, "client");
        assert.strictEqual(result?.flags[0]?.defaultDev, "true");
        assert.strictEqual(result?.flags[0]?.defaultStg, "false");
        assert.strictEqual(result?.flags[0]?.defaultProd, "false");
    });

    it("returns null for content without block", () => {
        const content = "# Just content\n\nNo flag block here";

        const result = parseFlagBlock(content);

        assert.strictEqual(result, null);
    });

    it("parses multiple flags", () => {
        const content = `
<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
|---------|------|-----------|---------------|---------------|----------------|-----|
| flag_one | BOOLEAN | client | true | false | false | _auto-generated_ |
| flag_two | STRING | server | dev | stg | prod | _auto-generated_ |
<!-- REMOTE_CONFIG_FLAG_END -->`;

        const result = parseFlagBlock(content);

        assert.strictEqual(result?.flags.length, 2);
        assert.strictEqual(result?.flags[0]?.context, "flag_one");
        assert.strictEqual(result?.flags[1]?.context, "flag_two");
        assert.strictEqual(result?.flags[1]?.type, "STRING");
        assert.strictEqual(result?.flags[1]?.namespace, "server");
    });

    it("parses flag block with alignment colons", () => {
        const content = `
<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| alignment_test | BOOLEAN | client | true | false | false | _auto-generated_ |
<!-- REMOTE_CONFIG_FLAG_END -->`;

        const result = parseFlagBlock(content);

        assert.ok(result);
        assert.strictEqual(result?.flags.length, 1);
        assert.strictEqual(result?.flags[0]?.context, "alignment_test");
    });

    it("handles row with exactly 6 cells (auto-generates key)", () => {
        const content = `
<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) |
|---|---|---|---|---|---|
| no_key | BOOLEAN | client | true | false | false |
<!-- REMOTE_CONFIG_FLAG_END -->`;

        const result = parseFlagBlock(content);
        assert.strictEqual(result?.flags[0]?.key, "_auto-generated_");
    });

    it("handles blank lines and junk lines inside block", () => {
        const content = `
<!-- REMOTE_CONFIG_FLAG_START -->

| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
Junk line that should be ignored
|---------|------|-----------|---------------|---------------|----------------|-----|

| valid_row | BOOLEAN | client | true | false | false | \`key\` |

<!-- REMOTE_CONFIG_FLAG_END -->`;

        const result = parseFlagBlock(content);
        assert.strictEqual(result?.flags.length, 1);
        assert.strictEqual(result?.flags[0]?.context, "valid_row");
    });

    it("skips malformed rows", () => {
        const content = `
<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| not_enough_cells | BOOLEAN | client |
| valid_row | BOOLEAN | client | true | false | false | _auto-generated_ |
<!-- REMOTE_CONFIG_FLAG_END -->`;

        const result = parseFlagBlock(content);
        assert.strictEqual(result?.flags.length, 1);
        assert.strictEqual(result?.flags[0]?.context, "valid_row");
    });
});

describe("extractFlagKeysFromContent", () => {
    it("extracts key from frontmatter", () => {
        const content = `---
flag_key: "feature_fe_1_fl_2_test_enabled"
---

Body`;

        const keys = extractFlagKeysFromContent(content);

        assert.ok(keys.includes("feature_fe_1_fl_2_test_enabled"));
    });

    it("extracts keys from flag block", () => {
        const content = `
<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
|---------|------|-----------|---------------|---------------|----------------|-----|
| test | BOOLEAN | client | true | false | false | \`feature_fe_100_fl_101_test_enabled\` |
<!-- REMOTE_CONFIG_FLAG_END -->`;

        const keys = extractFlagKeysFromContent(content);

        assert.ok(keys.includes("feature_fe_100_fl_101_test_enabled"));
    });

    it("returns empty array when no keys match pattern", () => {
        const content = `
<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
|---------|------|-----------|---------------|---------------|----------------|-----|
| test | BOOLEAN | client | true | false | false | \`custom_key\` |
<!-- REMOTE_CONFIG_FLAG_END -->`;

        const keys = extractFlagKeysFromContent(content);
        assert.strictEqual(keys.length, 0);
    });
});

describe("extractFlagKeysFromBlock", () => {
    it("extracts keys from block result", () => {
        const blockResult = {
            flags: [
                { key: "test_key", context: "", type: "BOOLEAN" as const, namespace: "client" as const, defaultDev: "", defaultStg: "", defaultProd: "" },
                { key: "_auto-generated_", context: "", type: "BOOLEAN" as const, namespace: "client" as const, defaultDev: "", defaultStg: "", defaultProd: "" }
            ],
            header: [],
            separator: [],
            rows: [],
            original: ""
        };
        const keys = extractFlagKeysFromBlock(blockResult);
        assert.deepStrictEqual(keys, ["test_key"]);
    });
});

describe("updateRowWithKey", () => {
    it("updates key column in row", () => {
        const row = "| context | type | ns | dev | stg | prod | _auto-generated_ |";
        const updated = updateRowWithKey(row, "new_key");
        assert.ok(updated.includes(" `new_key` "));
    });

    it("does nothing for row with too few cells", () => {
        const row = "| too | few | cells |";
        const updated = updateRowWithKey(row, "new_key");
        assert.strictEqual(updated, row);
    });
});

describe("rebuildFlagBlock", () => {
    it("constructs block from parts", () => {
        const header = ["| h |"];
        const separator = ["|---|"];
        const rows = ["| d |"];
        const block = rebuildFlagBlock(header, separator, rows);
        assert.ok(block.includes("<!-- REMOTE_CONFIG_FLAG_START -->"));
        assert.ok(block.includes("| h |"));
        assert.ok(block.includes("|---|"));
        assert.ok(block.includes("| d |"));
        assert.ok(block.includes("<!-- REMOTE_CONFIG_FLAG_END -->"));
    });
});

describe("internal parsing defaults", () => {
    it("defaults to STRING and client for invalid inputs", () => {
        const content = `
<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
|---------|------|-----------|---------------|---------------|----------------|-----|
| test | INVALID | UNKNOWN | true | false | false | _auto-generated_ |
<!-- REMOTE_CONFIG_FLAG_END -->`;

        const result = parseFlagBlock(content);
        assert.strictEqual(result?.flags[0]?.type, "STRING");
        assert.strictEqual(result?.flags[0]?.namespace, "client");
    });

    it("handles firebase-server namespace alias", () => {
        const content = `
<!-- REMOTE_CONFIG_FLAG_START -->
| Context | Type | Namespace | Default (Dev) | Default (Stg) | Default (Prod) | Key |
|---------|------|-----------|---------------|---------------|----------------|-----|
| test | STRING | firebase-server | true | false | false | _auto-generated_ |
<!-- REMOTE_CONFIG_FLAG_END -->`;

        const result = parseFlagBlock(content);
        assert.strictEqual(result?.flags[0]?.namespace, "server");
    });
});
