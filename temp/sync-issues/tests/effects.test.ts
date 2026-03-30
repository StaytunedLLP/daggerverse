/**
 * effects.test.ts
 *
 * Unit tests for effects module.
 * Updated for Result types.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import {
    readFile,
    writeFile,
    fileExists,
    walkDirectory,
    listMarkdownFiles,
    execCommand,
    execCommandSilent,
    log,
    resolveNamespace,
} from "../lib/effects.js";
import { isSuccess, isFailure } from "../lib/fp.js";

const TEST_DIR = join(tmpdir(), `effects-test-${Date.now()}`);

describe("File System Operations", () => {
    before(() => {
        mkdirSync(TEST_DIR, { recursive: true });
    });

    after(() => {
        if (existsSync(TEST_DIR)) {
            rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    it("readFile reads file content", () => {
        const testFile = join(TEST_DIR, "read-test.txt");
        writeFileSync(testFile, "test content");

        const result = readFile(testFile);
        assert.ok(isSuccess(result));
        assert.strictEqual(result.value, "test content");
    });

    it("writeFile writes content to file", () => {
        const testFile = join(TEST_DIR, "write-test.txt");

        const writeRes = writeFile(testFile, "written content");
        assert.ok(isSuccess(writeRes));

        const readRes = readFile(testFile);
        assert.ok(isSuccess(readRes));
        assert.strictEqual(readRes.value, "written content");
    });

    it("fileExists returns true for existing files", () => {
        const testFile = join(TEST_DIR, "exists-test.txt");
        writeFileSync(testFile, "test");
        assert.strictEqual(fileExists(testFile), true);
    });
});

describe("walkDirectory", () => {
    const walkTestDir = join(TEST_DIR, "walk-test");

    before(() => {
        mkdirSync(join(walkTestDir, "sub"), { recursive: true });
        writeFileSync(join(walkTestDir, "file1.txt"), "1");
        writeFileSync(join(walkTestDir, "sub", "file2.txt"), "2");
    });

    after(() => {
        if (existsSync(walkTestDir)) {
            rmSync(walkTestDir, { recursive: true, force: true });
        }
    });

    it("returns empty array for non-existent directory", () => {
        const nonExistentPath = join(tmpdir(), "nonexistent-dir-" + Date.now());
        const result = walkDirectory(nonExistentPath);
        assert.ok(isSuccess(result));
        assert.deepStrictEqual(result.value, []);
    });

    it("recursively walks directory", () => {
        const result = walkDirectory(walkTestDir);
        assert.ok(isSuccess(result));
        assert.strictEqual(result.value.length, 2);
    });
});

describe("listMarkdownFiles", () => {
    const mdTestDir = join(TEST_DIR, "md-test");

    before(() => {
        mkdirSync(mdTestDir, { recursive: true });
        writeFileSync(join(mdTestDir, "doc.md"), "# Doc");
        writeFileSync(join(mdTestDir, "script.ts"), "console.log()");
    });

    after(() => {
        if (existsSync(mdTestDir)) {
            rmSync(mdTestDir, { recursive: true, force: true });
        }
    });

    it("filters only markdown files", () => {
        const result = listMarkdownFiles(mdTestDir);
        assert.ok(isSuccess(result));
        assert.strictEqual(result.value.length, 1);
        assert.ok(result.value[0].endsWith(".md"));
    });
});

describe("execCommand", () => {
    it("executes simple commands", () => {
        const result = execCommand("echo hello");
        assert.ok(isSuccess(result));
        assert.strictEqual(result.value, "hello");
    });
});
