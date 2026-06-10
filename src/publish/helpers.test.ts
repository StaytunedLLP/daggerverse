import { parseExactVersion } from "./helpers.js";

describe("parseExactVersion", () => {
  it("should parse valid exact versions", () => {
    expect(parseExactVersion("0.0.0")).toEqual({ major: 0, minor: 0, patch: 0 });
    expect(parseExactVersion("1.0.0")).toEqual({ major: 1, minor: 0, patch: 0 });
    expect(parseExactVersion("0.1.0")).toEqual({ major: 0, minor: 1, patch: 0 });
    expect(parseExactVersion("0.0.1")).toEqual({ major: 0, minor: 0, patch: 1 });
    expect(parseExactVersion("10.20.30")).toEqual({ major: 10, minor: 20, patch: 30 });
    expect(parseExactVersion("123.456.789")).toEqual({ major: 123, minor: 456, patch: 789 });
  });

  it("should throw on invalid formats", () => {
    // Missing components
    expect(() => parseExactVersion("1")).toThrow("Invalid version");
    expect(() => parseExactVersion("1.0")).toThrow("Invalid version");

    // Extra components
    expect(() => parseExactVersion("1.0.0.0")).toThrow("Invalid version");

    // Non-numeric components
    expect(() => parseExactVersion("a.b.c")).toThrow("Invalid version");
    expect(() => parseExactVersion("1.a.0")).toThrow("Invalid version");

    // Prefixes and suffixes
    expect(() => parseExactVersion("v1.0.0")).toThrow("Invalid version");
    expect(() => parseExactVersion(" 1.0.0 ")).toThrow("Invalid version");

    // Empty strings
    expect(() => parseExactVersion("")).toThrow("Invalid version");
    expect(() => parseExactVersion("   ")).toThrow("Invalid version");
  });

  it("should throw on pre-release tags and build metadata", () => {
    expect(() => parseExactVersion("1.0.0-alpha")).toThrow("Invalid version");
    expect(() => parseExactVersion("1.0.0-alpha.1")).toThrow("Invalid version");
    expect(() => parseExactVersion("1.0.0-0.3.7")).toThrow("Invalid version");
    expect(() => parseExactVersion("1.0.0-x.7.z.92")).toThrow("Invalid version");

    expect(() => parseExactVersion("1.0.0+build")).toThrow("Invalid version");
    expect(() => parseExactVersion("1.0.0+20130313144700")).toThrow("Invalid version");
    expect(() => parseExactVersion("1.0.0-beta+exp.sha.5114f85")).toThrow("Invalid version");
  });

  it("should throw on leading zeros in components", () => {
    expect(() => parseExactVersion("01.0.0")).toThrow("Invalid version");
    expect(() => parseExactVersion("1.01.0")).toThrow("Invalid version");
    expect(() => parseExactVersion("1.0.01")).toThrow("Invalid version");
    expect(() => parseExactVersion("00.0.0")).toThrow("Invalid version");
  });
});
