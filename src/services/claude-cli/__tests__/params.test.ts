import { describe, expect, it } from "vitest"

describe("buildArgs", () => {
  // --- QueryParams (updated signatures + fixed order) ---

  it("minimal: only prompt → base flags (commandFlags prepended)", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    expect(buildArgs(new QueryParams({ prompt: "Hello" }), QueryParams)).toEqual([
      "--output-format", "stream-json", "-p", "Hello",
    ])
  })

  it("--model", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", model: "claude-opus-4-6" }), QueryParams)
    expect(args).toContain("--model")
    expect(args).toContain("claude-opus-4-6")
  })

  it("--append-system-prompt", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", append_system_prompt: "Be brief" }), QueryParams)
    expect(args).toContain("--append-system-prompt")
    expect(args).toContain("Be brief")
  })

  it("--allowedTools (variadic)", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", allowed_tools: ["Read", "Write"] }), QueryParams)
    const idx = args.indexOf("--allowedTools")
    expect(idx).toBeGreaterThan(-1)
    expect(args[idx + 1]).toBe("Read")
    expect(args[idx + 2]).toBe("Write")
  })

  it("empty allowed_tools does NOT emit --allowedTools", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", allowed_tools: [] }), QueryParams)
    expect(args).not.toContain("--allowedTools")
  })

  it("--max-turns", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_turns: 5 }), QueryParams)
    expect(args).toContain("--max-turns")
    expect(args).toContain("5")
  })

  it("--max-budget-usd", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_budget_usd: 0.5 }), QueryParams)
    expect(args).toContain("--max-budget-usd")
    expect(args).toContain("0.5")
  })

  it("--bare when true", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    expect(buildArgs(new QueryParams({ prompt: "Hi", bare: true }), QueryParams)).toContain("--bare")
  })

  it("no --bare when false", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    expect(buildArgs(new QueryParams({ prompt: "Hi", bare: false }), QueryParams)).not.toContain("--bare")
  })

  it("--session-id", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", session_id: "sess_01" }), QueryParams)
    expect(args).toContain("--session-id")
    expect(args).toContain("sess_01")
  })

  it("--name", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", name: "my-session" }), QueryParams)
    expect(args).toContain("--name")
    expect(args).toContain("my-session")
  })

  it("--max-turns with value 0 (undefined guard, not falsy)", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_turns: 0 }), QueryParams)
    expect(args).toContain("--max-turns")
    expect(args).toContain("0")
  })

  it("--max-budget-usd with value 0 (undefined guard, not falsy)", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_budget_usd: 0 }), QueryParams)
    expect(args).toContain("--max-budget-usd")
    expect(args).toContain("0")
  })

  it("--verbose and --include-partial-messages together", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", include_partial_messages: true }), QueryParams)
    expect(args).toContain("--verbose")
    expect(args).toContain("--include-partial-messages")
  })

  it("all classes emit --output-format stream-json from commandFlags", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams, ResumeParams, ContinueParams } = await import("../params")
    const q = buildArgs(new QueryParams({ prompt: "Hi" }), QueryParams)
    const r = buildArgs(new ResumeParams({ prompt: "Hi", session_id: "sess_01" }), ResumeParams)
    const c = buildArgs(new ContinueParams({ prompt: "Hi" }), ContinueParams)
    for (const args of [q, r, c]) {
      const idx = args.indexOf("--output-format")
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(args[idx + 1]).toBe("stream-json")
    }
  })

  // --- ResumeParams ---

  it("ResumeParams emits --resume <id> and NOT --session-id", async () => {
    const { buildArgs } = await import("../service")
    const { ResumeParams } = await import("../params")
    const args = buildArgs(new ResumeParams({ prompt: "Hi", session_id: "sess_01" }), ResumeParams)
    expect(args).toContain("--resume")
    expect(args).toContain("sess_01")
    expect(args).not.toContain("--session-id")
  })

  it("ResumeParams with fork: true emits --fork-session", async () => {
    const { buildArgs } = await import("../service")
    const { ResumeParams } = await import("../params")
    const args = buildArgs(new ResumeParams({ prompt: "Hi", session_id: "sess_01", fork: true }), ResumeParams)
    expect(args).toContain("--fork-session")
  })

  it("ResumeParams with fork: false does NOT emit --fork-session", async () => {
    const { buildArgs } = await import("../service")
    const { ResumeParams } = await import("../params")
    const args = buildArgs(new ResumeParams({ prompt: "Hi", session_id: "sess_01", fork: false }), ResumeParams)
    expect(args).not.toContain("--fork-session")
  })

  it("ResumeParams with fork: undefined does NOT emit --fork-session", async () => {
    const { buildArgs } = await import("../service")
    const { ResumeParams } = await import("../params")
    const args = buildArgs(new ResumeParams({ prompt: "Hi", session_id: "sess_01" }), ResumeParams)
    expect(args).not.toContain("--fork-session")
  })

  // --- ContinueParams ---

  it("ContinueParams emits --continue", async () => {
    const { buildArgs } = await import("../service")
    const { ContinueParams } = await import("../params")
    const args = buildArgs(new ContinueParams({ prompt: "Hi" }), ContinueParams)
    expect(args).toContain("--continue")
  })

  it("ContinueParams does NOT contain --session-id", async () => {
    const { buildArgs } = await import("../service")
    const { ContinueParams } = await import("../params")
    const args = buildArgs(new ContinueParams({ prompt: "Hi" }), ContinueParams)
    expect(args).not.toContain("--session-id")
    expect(args).not.toContain("--resume")
  })
})
