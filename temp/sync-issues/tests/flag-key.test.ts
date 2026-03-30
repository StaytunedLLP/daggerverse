/**
 * flag-key.test.ts
 *
 * Unit tests for flag key derivation functions.
 * Uses native Node.js test runner.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeContext, deriveFlagKey, parseFlagKey, isValidFlagKey } from "../lib/flag-key.js";

describe("sanitizeContext", () => {
    it("converts to lowercase", () => {
        assert.strictEqual(sanitizeContext("SocialLogin"), "sociallogin");
    });

    it("replaces hyphens with underscores", () => {
        assert.strictEqual(sanitizeContext("dark-mode"), "dark_mode");
    });

    it("replaces spaces with underscores", () => {
        assert.strictEqual(sanitizeContext("user profile"), "user_profile");
    });

    it("collapses multiple underscores", () => {
        assert.strictEqual(sanitizeContext("foo___bar"), "foo_bar");
    });

    it("trims leading and trailing underscores", () => {
        assert.strictEqual(sanitizeContext("_foo_bar_"), "foo_bar");
    });

    it("removes special characters", () => {
        assert.strictEqual(sanitizeContext("feature@v2!"), "feature_v2");
    });

    it("handles empty string", () => {
        assert.strictEqual(sanitizeContext(""), "");
    });
});

describe("deriveFlagKey", () => {
    it("constructs correct key format", () => {
        assert.strictEqual(
            deriveFlagKey(300, 301, "social_login"),
            "feature_fe_300_fl_301_social_login_enabled"
        );
    });

    it("sanitizes context in key", () => {
        assert.strictEqual(
            deriveFlagKey(100, 101, "Dark-Mode"),
            "feature_fe_100_fl_101_dark_mode_enabled"
        );
    });

    it("handles numeric context", () => {
        assert.strictEqual(
            deriveFlagKey(200, 201, "v2"),
            "feature_fe_200_fl_201_v2_enabled"
        );
    });

    it("uses _val for STRING type", () => {
        assert.strictEqual(
            deriveFlagKey(300, 301, "api_url", "STRING"),
            "feature_fe_300_fl_301_api_url_val"
        );
    });

    it("uses _config for JSON type", () => {
        assert.strictEqual(
            deriveFlagKey(300, 301, "settings", "JSON"),
            "feature_fe_300_fl_301_settings_config"
        );
    });

});

describe("parseFlagKey", () => {
    it("parses valid flag key", () => {
        const result = parseFlagKey("feature_fe_300_fl_301_social_login_enabled");
        assert.deepStrictEqual(result, {
            featureNumber: 300,
            flagNumber: 301,
            context: "social_login",
            suffix: "enabled"
        });
    });

    it("parses valid config key", () => {
        const result = parseFlagKey("feature_fe_300_fl_301_settings_config");
        assert.deepStrictEqual(result, {
            featureNumber: 300,
            flagNumber: 301,
            context: "settings",
            suffix: "config"
        });
    });

    it("parses valid val key", () => {
        const result = parseFlagKey("feature_fe_300_fl_301_api_url_val");
        assert.deepStrictEqual(result, {
            featureNumber: 300,
            flagNumber: 301,
            context: "api_url",
            suffix: "val"
        });
    });


    it("returns null for invalid key", () => {
        assert.strictEqual(parseFlagKey("invalid_key"), null);
    });

    it("returns null for empty string", () => {
        assert.strictEqual(parseFlagKey(""), null);
    });

    it("handles context with underscores", () => {
        const result = parseFlagKey("feature_fe_100_fl_101_dark_mode_v2_enabled");
        assert.deepStrictEqual(result, {
            featureNumber: 100,
            flagNumber: 101,
            context: "dark_mode_v2",
            suffix: "enabled"
        });
    });

});

describe("isValidFlagKey", () => {
    it("returns true for valid keys", () => {
        assert.strictEqual(isValidFlagKey("feature_fe_300_fl_301_social_login_enabled"), true);
        assert.strictEqual(isValidFlagKey("feature_fe_300_fl_302_settings_config"), true);
        assert.strictEqual(isValidFlagKey("feature_fe_300_fl_303_api_url_val"), true);
    });


    it("returns false for invalid keys", () => {
        assert.strictEqual(isValidFlagKey("some_random_key"), false);
    });

    it("returns false for partial keys", () => {
        assert.strictEqual(isValidFlagKey("feature_fe_300_fl_301"), false);
    });
});
