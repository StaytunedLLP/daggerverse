/**
 * template.test.ts
 *
 * Unit tests for template manipulation functions.
 * Uses native Node.js test runner.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    isValidValueType,
    normalizeValueType,
    createParameter,
    createParameterGroup,
    createTemplateFragment,
    mergeTemplates,
    removeParameter,
    updateParameterValue,
    extractFlagKeys,
    findParameter,
    createEmptyTemplate,
} from "../lib/template.js";
import type { RemoteConfigTemplate, ParameterGroup } from "../lib/types.js";

describe("isValidValueType", () => {
    it("returns true for valid types", () => {
        assert.strictEqual(isValidValueType("BOOLEAN"), true);
        assert.strictEqual(isValidValueType("STRING"), true);
        assert.strictEqual(isValidValueType("NUMBER"), true);
        assert.strictEqual(isValidValueType("JSON"), true);
    });

    it("returns false for invalid types", () => {
        assert.strictEqual(isValidValueType("INVALID"), false);
        assert.strictEqual(isValidValueType(""), false);
    });
});

describe("normalizeValueType", () => {
    it("returns type unchanged if valid", () => {
        assert.strictEqual(normalizeValueType("BOOLEAN"), "BOOLEAN");
    });

    it("returns STRING for invalid types", () => {
        assert.strictEqual(normalizeValueType("INVALID"), "STRING");
    });
});

describe("createParameter", () => {
    it("creates parameter with correct structure", () => {
        const param = createParameter("true", "Test flag", "BOOLEAN");

        assert.deepStrictEqual(param, {
            defaultValue: { value: "true" },
            description: "Test flag",
            valueType: "BOOLEAN",
        });
    });
});

describe("createTemplateFragment", () => {
    it("creates fragment with parameter group", () => {
        const fragment = createTemplateFragment(
            "auth",
            "feature_fe_1_fl_2_test_enabled",
            "true",
            "Test",
            "BOOLEAN"
        );

        assert.ok(fragment.parameterGroups?.["auth"]);
        assert.ok(fragment.parameterGroups?.["auth"]?.parameters["feature_fe_1_fl_2_test_enabled"]);
    });
});

describe("mergeTemplates", () => {
    it("merges new parameter into empty template", () => {
        const existing = createEmptyTemplate();
        const incoming = createTemplateFragment("auth", "flag1", "true", "Test", "BOOLEAN");

        const merged = mergeTemplates(existing, incoming);

        assert.ok(merged.parameterGroups["auth"]);
        assert.ok(merged.parameterGroups["auth"]?.parameters["flag1"]);
    });

    it("preserves existing parameters when merging", () => {
        const existing: RemoteConfigTemplate = {
            conditions: [],
            parameterGroups: {
                auth: {
                    parameters: {
                        existing_flag: {
                            defaultValue: { value: "false" },
                            description: "Existing",
                            valueType: "BOOLEAN",
                        },
                    },
                },
            },
        };

        const incoming = createTemplateFragment("auth", "new_flag", "true", "New", "BOOLEAN");
        const merged = mergeTemplates(existing, incoming);

        assert.ok(merged.parameterGroups["auth"]?.parameters["existing_flag"]);
        assert.ok(merged.parameterGroups["auth"]?.parameters["new_flag"]);
    });

    it("does not mutate original template", () => {
        const existing = createEmptyTemplate();
        const incoming = createTemplateFragment("auth", "flag1", "true", "Test", "BOOLEAN");

        mergeTemplates(existing, incoming);

        assert.deepStrictEqual(existing.parameterGroups, {});
    });

    it("merges templates with missing optional fields", () => {
        const existing: any = {};
        const incoming: any = {};
        const merged = mergeTemplates(existing, incoming);
        assert.deepStrictEqual(merged.parameterGroups, {});
        assert.deepStrictEqual(merged.conditions, []);
    });

    it("merges into existing group", () => {
        const existing: RemoteConfigTemplate = {
            conditions: [],
            parameterGroups: {
                auth: { parameters: { f1: { defaultValue: { value: "v1" }, description: "", valueType: "STRING" } } }
            }
        };
        const incoming: Partial<RemoteConfigTemplate> = {
            parameterGroups: {
                auth: { parameters: { f2: { defaultValue: { value: "v2" }, description: "", valueType: "STRING" } } }
            }
        };
        const merged = mergeTemplates(existing, incoming);
        assert.ok(merged.parameterGroups["auth"].parameters["f1"]);
        assert.ok(merged.parameterGroups["auth"].parameters["f2"]);
    });

    it("handles null parameterGroups and conditions in mergeTemplates", () => {
        const existing: any = { parameterGroups: null, conditions: null };
        const incoming: any = { parameterGroups: null };
        const merged = mergeTemplates(existing, incoming);
        assert.deepStrictEqual(merged.parameterGroups, {});
        assert.deepStrictEqual(merged.conditions, []);
    });

    it("preserves existing conditions during merge", () => {
        const existing: RemoteConfigTemplate = {
            conditions: [{ name: "c1", expression: "true" }],
            parameterGroups: {}
        };
        const merged = mergeTemplates(existing, {});
        assert.deepStrictEqual(merged.conditions, existing.conditions);
    });
});

describe("removeParameter", () => {
    it("removes parameter from template", () => {
        const template: RemoteConfigTemplate = {
            conditions: [],
            parameterGroups: {
                auth: {
                    parameters: {
                        flag1: { defaultValue: { value: "true" }, description: "Flag 1", valueType: "BOOLEAN" },
                        flag2: { defaultValue: { value: "false" }, description: "Flag 2", valueType: "BOOLEAN" },
                    },
                },
            },
        };

        const result = removeParameter(template, "auth", "flag1");

        assert.strictEqual(result.parameterGroups["auth"]?.parameters["flag1"], undefined);
        assert.ok(result.parameterGroups["auth"]?.parameters["flag2"]);
    });

    it("removes empty parameter group", () => {
        const template: RemoteConfigTemplate = {
            conditions: [],
            parameterGroups: {
                auth: {
                    parameters: {
                        flag1: { defaultValue: { value: "true" }, description: "Flag 1", valueType: "BOOLEAN" },
                    },
                },
            },
        };

        const result = removeParameter(template, "auth", "flag1");

        assert.strictEqual(result.parameterGroups["auth"], undefined);
    });

    it("returns original template if parameter to remove does not exist", () => {
        const template = createEmptyTemplate();
        const result = removeParameter(template, "auth", "flag1");
        assert.deepStrictEqual(result, template);
    });

    it("handles missing conditions in template during removal", () => {
        const template: any = { parameterGroups: { auth: { parameters: { f: {} } } } };
        const result = removeParameter(template, "auth", "f");
        assert.deepStrictEqual(result.conditions, []);
    });

    it("does nothing if group exists but key does not in removal", () => {
        const template: RemoteConfigTemplate = {
            conditions: [],
            parameterGroups: {
                auth: { parameters: { f2: { defaultValue: { value: "v" }, description: "", valueType: "STRING" } } }
            }
        };
        const result = removeParameter(template, "auth", "f1");
        assert.deepStrictEqual(result, template);
    });

    it("handles null parameterGroups in removeParameter", () => {
        const result = removeParameter({ parameterGroups: null } as any, "auth", "f");
        assert.deepStrictEqual(result.parameterGroups, {});
    });
});

describe("updateParameterValue", () => {
    it("updates parameter default value", () => {
        const template: RemoteConfigTemplate = {
            conditions: [],
            parameterGroups: {
                auth: {
                    parameters: {
                        flag1: { defaultValue: { value: "false" }, description: "Flag 1", valueType: "BOOLEAN" },
                    },
                },
            },
        };

        const result = updateParameterValue(template, "flag1", "true");

        assert.strictEqual(result.parameterGroups["auth"]?.parameters["flag1"]?.defaultValue.value, "true");
    });

    it("preserves groups where flag does not exist", () => {
        const template: RemoteConfigTemplate = {
            conditions: [],
            parameterGroups: {
                auth: { parameters: { f1: { defaultValue: { value: "v" }, description: "", valueType: "STRING" } } },
                other: { parameters: { f2: { defaultValue: { value: "v" }, description: "", valueType: "STRING" } } }
            }
        };
        const result = updateParameterValue(template, "f1", "new");
        assert.strictEqual(result.parameterGroups["auth"].parameters["f1"].defaultValue.value, "new");
        assert.strictEqual(result.parameterGroups["other"].parameters["f2"].defaultValue.value, "v");
    });

    it("handles null parameterGroups in updateParameterValue", () => {
        const result = updateParameterValue({ parameterGroups: null } as any, "f", "v");
        assert.deepStrictEqual(result.parameterGroups, {});
    });
});

describe("extractFlagKeys", () => {
    it("extracts keys matching pattern", () => {
        const template: RemoteConfigTemplate = {
            conditions: [],
            parameterGroups: {
                auth: {
                    parameters: {
                        feature_fe_1_fl_2_test_enabled: { defaultValue: { value: "true" }, description: "", valueType: "BOOLEAN" },
                        other_key: { defaultValue: { value: "true" }, description: "", valueType: "BOOLEAN" },
                    },
                },
            },
        };

        const keys = extractFlagKeys(template);

        assert.deepStrictEqual(keys, ["feature_fe_1_fl_2_test_enabled"]);
    });

    it("handles missing optional fields in extractFlagKeys", () => {
        const template: any = { parameterGroups: { auth: {} } };
        const keys = extractFlagKeys(template);
        assert.strictEqual(keys.length, 0);

        const template2: any = {};
        const keys2 = extractFlagKeys(template2);
        assert.strictEqual(keys2.length, 0);

        const template3: any = { parameterGroups: { auth: { parameters: null } } };
        const keys3 = extractFlagKeys(template3);
        assert.strictEqual(keys3.length, 0);
    });
});

describe("findParameter", () => {
    it("finds parameter by key", () => {
        const template: RemoteConfigTemplate = {
            conditions: [],
            parameterGroups: {
                auth: {
                    parameters: {
                        flag1: { defaultValue: { value: "true" }, description: "Flag 1", valueType: "BOOLEAN" },
                    },
                },
            },
        };

        const result = findParameter(template, "flag1");

        assert.ok(result);
        assert.strictEqual(result?.groupName, "auth");
        assert.strictEqual(result?.parameter.defaultValue.value, "true");
    });

    it("returns null for missing key", () => {
        const template = createEmptyTemplate();
        const result = findParameter(template, "nonexistent");

        assert.strictEqual(result, null);
    });

    it("returns null when groups exist but key does not", () => {
        const template: RemoteConfigTemplate = {
            conditions: [],
            parameterGroups: {
                auth: { parameters: { f1: { defaultValue: { value: "v" }, description: "", valueType: "STRING" } } }
            }
        };
        const result = findParameter(template, "f2");
        assert.strictEqual(result, null);
    });

    it("handles missing parameterGroups in findParameter", () => {
        const result = findParameter({} as any, "f");
        assert.strictEqual(result, null);
    });

    it("handles null parameterGroups in findParameter", () => {
        const result = findParameter({ parameterGroups: null } as any, "f");
        assert.strictEqual(result, null);
    });
});
