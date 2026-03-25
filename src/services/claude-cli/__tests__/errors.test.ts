import { describe, expect, it } from "vitest";

describe("ClaudeCliSpawnError", () => {
  it("has correct _tag and fields", async () => {
    const { ClaudeCliSpawnError } = await import("../errors");
    const err = new ClaudeCliSpawnError({
      message: "not found",
      cause: "Error: ENOENT",
    });
    expect(err._tag).toBe("ClaudeCliSpawnError");
    expect(err.message).toBe("not found");
    expect(err.cause).toBe("Error: ENOENT");
  });
});

describe("ClaudeCliParseError", () => {
  it("has correct _tag and fields", async () => {
    const { ClaudeCliParseError } = await import("../errors");
    const err = new ClaudeCliParseError({
      raw: "{bad}",
      cause: "SyntaxError: Unexpected token",
    });
    expect(err._tag).toBe("ClaudeCliParseError");
    expect(err.raw).toBe("{bad}");
    expect(err.cause).toBe("SyntaxError: Unexpected token");
  });
});

describe("ClaudeCliProcessError", () => {
  it("has correct _tag and fields", async () => {
    const { ClaudeCliProcessError } = await import("../errors");
    const err = new ClaudeCliProcessError({
      exitCode: 1,
      stderr: "rate limit",
    });
    expect(err._tag).toBe("ClaudeCliProcessError");
    expect(err.exitCode).toBe(1);
    expect(err.stderr).toBe("rate limit");
  });
});
