import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { ContinueParams, QueryParams, ResumeParams } from "../params";

describe("params", () => {
  it("QueryParams decodes a minimal payload", () => {
    const p = Schema.decodeUnknownSync(QueryParams)({ prompt: "hi" });
    expect(p.prompt).toBe("hi");
  });

  it("ResumeParams requires session_id", () => {
    expect(() =>
      Schema.decodeUnknownSync(ResumeParams)({ prompt: "hi" }),
    ).toThrow();
  });

  it("ContinueParams accepts cwd + allowed_tools", () => {
    const p = Schema.decodeUnknownSync(ContinueParams)({
      prompt: "hi",
      cwd: "/tmp",
      allowed_tools: ["Read"],
    });
    expect(p.cwd).toBe("/tmp");
    expect(p.allowed_tools).toEqual(["Read"]);
  });
});
