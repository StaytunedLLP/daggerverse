import assert from "node:assert";
import { describe, it } from "node:test";
import { validatePrTitle } from "./pr-checks.js";

describe("validatePrTitle", () => {
  describe("valid titles", () => {
    it("should accept basic conventional commits", () => {
      validatePrTitle("feat: add new feature");
      validatePrTitle("fix: resolve bug");
      validatePrTitle("chore: update dependencies");
      validatePrTitle("docs: update readme");
      validatePrTitle("style: format code");
      validatePrTitle("refactor: extract method");
      validatePrTitle("perf: improve query speed");
      validatePrTitle("test: add unit tests");
    });

    it("should accept commits with scopes", () => {
      validatePrTitle("feat(api): add new endpoint");
      validatePrTitle("fix(ui): resolve layout issue");
      validatePrTitle("chore(deps): update react");
      validatePrTitle("feat(core-module): handle hyphenated scopes");
      validatePrTitle("fix(core.module): handle dotted scopes");
    });

    it("should accept commits with breaking change indicators", () => {
      validatePrTitle("feat!: break backwards compatibility");
      validatePrTitle("fix(api)!: change response format");
    });
  });

  describe("invalid titles", () => {
    it("should throw for an invalid prefix", () => {
      assert.throws(
        () => validatePrTitle("update: add new feature"),
        (err: Error) => {
          assert.strictEqual(
            err.message.includes("The type must be one of:"),
            true
          );
          return true;
        }
      );
    });

    it("should throw when missing a space after the colon", () => {
      assert.throws(
        () => validatePrTitle("feat:add new feature"),
        (err: Error) => {
          assert.strictEqual(
            err.message.includes("A space MUST follow the terminal colon"),
            true
          );
          return true;
        }
      );
      assert.throws(
        () => validatePrTitle("feat(api):add new feature"),
        (err: Error) => {
          assert.strictEqual(
            err.message.includes("A space MUST follow the terminal colon"),
            true
          );
          return true;
        }
      );
    });

    it("should throw when breaking change indicator is incorrectly placed", () => {
      assert.throws(
        () => validatePrTitle("feat(!): add new feature"),
        (err: Error) => {
          assert.strictEqual(
            err.message.includes("not inside the scope"),
            true
          );
          return true;
        }
      );
    });

    it("should throw for missing descriptions", () => {
      assert.throws(
        () => validatePrTitle("feat: "),
        (err: Error) => {
          assert.strictEqual(
            err.message.includes("The title must follow the pattern"),
            true
          );
          return true;
        }
      );
    });

    it("should throw for completely malformed titles", () => {
      assert.throws(
        () => validatePrTitle("Add new feature"),
        (err: Error) => {
          assert.strictEqual(
            err.message.includes("The type must be one of:"),
            true
          );
          return true;
        }
      );
    });
  });
});
