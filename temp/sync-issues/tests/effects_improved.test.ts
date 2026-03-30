/**
 * effects_improved.test.ts
 * 
 * Target tests to increase coverage for error paths and missed functions in effects.ts.
 * Updated for Result types.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as effects from "../lib/effects.js";
import { setupMockEnv } from "./mock-setup.js";
import { isSuccess, isFailure } from "../lib/fp.js";

describe("Effects: Misc Coverage", () => {
    setupMockEnv();

    it("getAccessToken: handles success", () => {
        const result = effects.getAccessToken();
        assert.ok(isSuccess(result));
        if (isSuccess(result)) {
            assert.strictEqual(result.value, "mock-access-token");
        }
    });

    it("getAccessToken: handles failure", () => {
        process.env.GH_MOCK_FAIL = "true";
        const result = effects.getAccessToken();
        assert.ok(isFailure(result));
        delete process.env.GH_MOCK_FAIL;
    });

    it("fetchTemplate: handles failure path", () => {
        const result = effects.fetchTemplate("nonexistent-project", "firebase", "token");
        assert.ok(isFailure(result));
    });

    it("publishTemplate: handles failure path", () => {
        const result = effects.publishTemplate("nonexistent-project", {} as any, "firebase", "token");
        assert.ok(isFailure(result));
    });

    it("findIssueByTitle: handles no results", () => {
        const result = effects.findIssueByTitle("nonexistent-title-999");
        assert.ok(isSuccess(result));
        if (isSuccess(result)) {
            assert.strictEqual(result.value, null);
        }
    });

    it("closeIssue: handles success", () => {
        const result = effects.closeIssue(123, "Test comment");
        assert.ok(isSuccess(result));
    });

    it("closeIssue: handles failure", () => {
        const result = effects.closeIssue(999, "Fail this");
        assert.ok(isFailure(result));
    });
});
