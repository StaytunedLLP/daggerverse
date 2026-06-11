import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postPrComment } from "./pr-checks.js";
import { Secret } from "@dagger.io/dagger";

describe("postPrComment", () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockSecret: Secret;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof global.fetch;

    mockSecret = {
      plaintext: vi.fn().mockResolvedValue("mock-github-token"),
    } as unknown as Secret;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("should post a comment successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue("Success"),
    });

    await postPrComment(
      mockSecret,
      "owner/repo",
      123,
      "Test comment"
    );

    expect(mockSecret.plaintext).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/issues/123/comments",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer mock-github-token",
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: "Test comment" }),
      }
    );
  });

  it("should throw an error if the response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: vi.fn().mockResolvedValue("API limit exceeded"),
    });

    await expect(
      postPrComment(mockSecret, "owner/repo", 123, "Test comment")
    ).rejects.toThrow(
      "GitHub API error: 403 Forbidden - API limit exceeded"
    );

    expect(mockSecret.plaintext).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalled();
  });
});
