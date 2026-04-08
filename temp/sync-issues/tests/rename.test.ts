/**
 * rename.test.ts
 *
 * Unit tests for rename functions.
 * These are pure functions that don't require mocking.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    calculateRenamedPath,
    generateLinkPatterns,
    updateLinksInContent,
    calculateRelativePath,
    filterPendingRenames,
    buildRenameMap,
    applyRenameToPath,
} from "../lib/rename.js";

describe("calculateRenamedPath", () => {
    it("returns null if file already has correct prefix", () => {
        const result = calculateRenamedPath("/path/to/feat-123-login.md", 123, "feat");
        assert.strictEqual(result, null);
    });

    it("adds prefix to file without prefix", () => {
        const result = calculateRenamedPath("/path/to/login.md", 123, "feat");
        assert.ok(result);
        assert.strictEqual(result.newName, "feat-123-login.md");
        assert.strictEqual(result.oldName, "login.md");
    });

    it("replaces existing prefix with new one", () => {
        const result = calculateRenamedPath("/path/to/feat-999-login.md", 123, "feat");
        assert.ok(result);
        assert.strictEqual(result.newName, "feat-123-login.md");
    });

    it("handles epic prefix", () => {
        const result = calculateRenamedPath("/path/to/auth.md", 50, "epic");
        assert.ok(result);
        assert.strictEqual(result.newName, "epic-50-auth.md");
    });

    it("updates newPath with correct directory", () => {
        const result = calculateRenamedPath("/some/deep/path/file.md", 10, "feat");
        assert.ok(result);
        assert.strictEqual(result.newPath, "/some/deep/path/feat-10-file.md");
    });
});

describe("generateLinkPatterns", () => {
    it("generates patterns for various link formats", () => {
        const rename = {
            oldPath: "/path/to/old.md",
            newPath: "/path/to/new.md",
            oldName: "old.md",
            newName: "new.md",
        };
        const patterns = generateLinkPatterns(rename);
        assert.strictEqual(patterns.length, 3);
    });

    it("escapes special regex characters in filename", () => {
        const rename = {
            oldPath: "/path/to/file[1].md",
            newPath: "/path/to/new.md",
            oldName: "file[1].md",
            newName: "new.md",
        };
        const patterns = generateLinkPatterns(rename);
        // Should not throw when creating the regex
        assert.strictEqual(patterns.length, 3);
    });
});

describe("updateLinksInContent", () => {
    it("replaces old filenames with new ones", () => {
        const content = "See [login](./login.md) for details.";
        const renames = [
            {
                oldPath: "/path/login.md",
                newPath: "/path/feat-1-login.md",
                oldName: "login.md",
                newName: "feat-1-login.md",
            },
        ];
        const result = updateLinksInContent(content, renames);
        assert.strictEqual(result, "See [login](./feat-1-login.md) for details.");
    });

    it("handles multiple renames", () => {
        const content = "See [a](a.md) and [b](b.md).";
        const renames = [
            { oldPath: "/a.md", newPath: "/new-a.md", oldName: "a.md", newName: "new-a.md" },
            { oldPath: "/b.md", newPath: "/new-b.md", oldName: "b.md", newName: "new-b.md" },
        ];
        const result = updateLinksInContent(content, renames);
        assert.strictEqual(result, "See [a](new-a.md) and [b](new-b.md).");
    });

    it("returns original content if no renames", () => {
        const content = "No changes here.";
        const result = updateLinksInContent(content, []);
        assert.strictEqual(result, content);
    });
});

describe("calculateRelativePath", () => {
    it("calculates relative path between files", () => {
        const result = calculateRelativePath("/a/b/file.md", "/a/c/other.md");
        assert.strictEqual(result, "../c/other.md");
    });

    it("handles same directory", () => {
        const result = calculateRelativePath("/a/b/file.md", "/a/b/other.md");
        assert.strictEqual(result, "other.md");
    });
});

describe("filterPendingRenames", () => {
    it("filters out null values", () => {
        const input = [
            { oldPath: "/a", newPath: "/b", oldName: "a", newName: "b" },
            null,
            { oldPath: "/c", newPath: "/d", oldName: "c", newName: "d" },
            null,
        ];
        const result = filterPendingRenames(input);
        assert.strictEqual(result.length, 2);
    });

    it("returns empty array for all nulls", () => {
        const result = filterPendingRenames([null, null]);
        assert.strictEqual(result.length, 0);
    });
});

describe("buildRenameMap", () => {
    it("builds map from old to new paths", () => {
        const renames = [
            { oldPath: "/a", newPath: "/b", oldName: "a", newName: "b" },
            { oldPath: "/c", newPath: "/d", oldName: "c", newName: "d" },
        ];
        const map = buildRenameMap(renames);
        assert.strictEqual(map.get("/a"), "/b");
        assert.strictEqual(map.get("/c"), "/d");
        assert.strictEqual(map.size, 2);
    });
});

describe("applyRenameToPath", () => {
    it("returns new path if in map", () => {
        const map = new Map([["/old", "/new"]]);
        assert.strictEqual(applyRenameToPath("/old", map), "/new");
    });

    it("returns original path if not in map", () => {
        const map = new Map([["/old", "/new"]]);
        assert.strictEqual(applyRenameToPath("/other", map), "/other");
    });
});
