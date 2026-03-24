import { Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"

describe("Usage", () => {
  it("decodes full object", async () => {
    const { Usage } = await import("../events")
    const raw = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 10 }
    const result = await Effect.runPromise(Schema.decodeUnknown(Usage)(raw))
    expect(result.input_tokens).toBe(100)
    expect(result.output_tokens).toBe(50)
  })

  it("decodes with all fields missing (all optional)", async () => {
    const { Usage } = await import("../events")
    const result = await Effect.runPromise(Schema.decodeUnknown(Usage)({}))
    expect(result.input_tokens).toBeUndefined()
  })
})

describe("ContentBlock union", () => {
  it("decodes TextBlock", async () => {
    const { ContentBlock } = await import("../events")
    const raw = { type: "text", text: "Hello world" }
    const result = await Effect.runPromise(Schema.decodeUnknown(ContentBlock)(raw))
    expect(result.type).toBe("text")
  })

  it("decodes ToolUseBlock", async () => {
    const { ContentBlock } = await import("../events")
    const raw = { type: "tool_use", id: "tool_123", name: "Read", input: { file: "foo.ts" } }
    const result = await Effect.runPromise(Schema.decodeUnknown(ContentBlock)(raw))
    expect(result.type).toBe("tool_use")
    // @ts-expect-error — narrowing to ToolUseBlock
    expect(result.id).toBe("tool_123")
  })
})

describe("ContentDelta union", () => {
  it("decodes TextDelta", async () => {
    const { ContentDelta } = await import("../events")
    const raw = { type: "text_delta", text: " world" }
    const result = await Effect.runPromise(Schema.decodeUnknown(ContentDelta)(raw))
    // @ts-expect-error — narrowing to TextDelta
    expect(result.text).toBe(" world")
  })

  it("decodes InputJsonDelta", async () => {
    const { ContentDelta } = await import("../events")
    const raw = { type: "input_json_delta", partial_json: '{"file":' }
    const result = await Effect.runPromise(Schema.decodeUnknown(ContentDelta)(raw))
    // @ts-expect-error — narrowing to InputJsonDelta
    expect(result.partial_json).toBe('{"file":')
  })
})

describe("ApiStreamEvent union", () => {
  it("decodes MessageStartApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events")
    const raw = {
      type: "message_start",
      message: {
        id: "msg_01", type: "message", role: "assistant", content: [],
        model: "claude-opus-4-6", stop_reason: null, stop_sequence: null,
        usage: { input_tokens: 25, output_tokens: 0 },
      },
    }
    const result = await Effect.runPromise(Schema.decodeUnknown(ApiStreamEvent)(raw))
    expect(result.type).toBe("message_start")
  })

  it("decodes ContentBlockStartApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events")
    const raw = { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }
    const result = await Effect.runPromise(Schema.decodeUnknown(ApiStreamEvent)(raw))
    expect(result.type).toBe("content_block_start")
  })

  it("decodes ContentBlockDeltaApiEvent with TextDelta", async () => {
    const { ApiStreamEvent } = await import("../events")
    const raw = { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } }
    const result = await Effect.runPromise(Schema.decodeUnknown(ApiStreamEvent)(raw))
    expect(result.type).toBe("content_block_delta")
  })

  it("decodes ContentBlockStopApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events")
    const result = await Effect.runPromise(Schema.decodeUnknown(ApiStreamEvent)({ type: "content_block_stop", index: 0 }))
    expect(result.type).toBe("content_block_stop")
  })

  it("decodes MessageDeltaApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events")
    const raw = {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 42 },
    }
    const result = await Effect.runPromise(Schema.decodeUnknown(ApiStreamEvent)(raw))
    expect(result.type).toBe("message_delta")
  })

  it("decodes MessageStopApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events")
    const result = await Effect.runPromise(Schema.decodeUnknown(ApiStreamEvent)({ type: "message_stop" }))
    expect(result.type).toBe("message_stop")
  })
})
