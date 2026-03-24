import { describe, expect, it } from "vitest"

describe("buildArgs", () => {
  it("minimal: only prompt → base flags", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    expect(buildArgs(new QueryParams({ prompt: "Hello" }), [])).toEqual([
      "-p", "Hello", "--output-format", "stream-json",
    ])
  })

  it("extra args are appended after base flags", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi" }), ["--resume", "sess_01"])
    expect(args).toContain("--resume")
    expect(args).toContain("sess_01")
  })

  it("--model", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", model: "claude-opus-4-6" }), [])
    expect(args).toContain("--model")
    expect(args).toContain("claude-opus-4-6")
  })

  it("--append-system-prompt", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", append_system_prompt: "Be brief" }), [])
    expect(args).toContain("--append-system-prompt")
    expect(args).toContain("Be brief")
  })

  it("--allowedTools (variadic)", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", allowed_tools: ["Read", "Write"] }), [])
    const idx = args.indexOf("--allowedTools")
    expect(idx).toBeGreaterThan(-1)
    expect(args[idx + 1]).toBe("Read")
    expect(args[idx + 2]).toBe("Write")
  })

  it("--max-turns", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_turns: 5 }), [])
    expect(args).toContain("--max-turns")
    expect(args).toContain("5")
  })

  it("--max-budget-usd", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_budget_usd: 0.5 }), [])
    expect(args).toContain("--max-budget-usd")
    expect(args).toContain("0.5")
  })

  it("--bare when true", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    expect(buildArgs(new QueryParams({ prompt: "Hi", bare: true }), [])).toContain("--bare")
  })

  it("no --bare when false", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    expect(buildArgs(new QueryParams({ prompt: "Hi", bare: false }), [])).not.toContain("--bare")
  })

  it("--session-id", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", session_id: "sess_01" }), [])
    expect(args).toContain("--session-id")
    expect(args).toContain("sess_01")
  })

  it("--name", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", name: "my-session" }), [])
    expect(args).toContain("--name")
    expect(args).toContain("my-session")
  })

  it("--max-turns with value 0 (undefined guard, not falsy)", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_turns: 0 }), [])
    expect(args).toContain("--max-turns")
    expect(args).toContain("0")
  })

  it("--max-budget-usd with value 0 (undefined guard, not falsy)", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_budget_usd: 0 }), [])
    expect(args).toContain("--max-budget-usd")
    expect(args).toContain("0")
  })

  it("--verbose and --include-partial-messages together", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", include_partial_messages: true }), [])
    expect(args).toContain("--verbose")
    expect(args).toContain("--include-partial-messages")
  })
})
