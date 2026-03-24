import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

describe("Usage", () => {
  it("decodes full object", async () => {
    const { Usage } = await import("../events");
    const raw = {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 10,
    };
    const result = await Effect.runPromise(Schema.decodeUnknown(Usage)(raw));
    expect(result.input_tokens).toBe(100);
    expect(result.output_tokens).toBe(50);
  });

  it("decodes with all fields missing (all optional)", async () => {
    const { Usage } = await import("../events");
    const result = await Effect.runPromise(Schema.decodeUnknown(Usage)({}));
    expect(result.input_tokens).toBeUndefined();
  });
});

describe("ContentBlock union", () => {
  it("decodes TextBlock", async () => {
    const { ContentBlock } = await import("../events");
    const raw = { type: "text", text: "Hello world" };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ContentBlock)(raw),
    );
    expect(result.type).toBe("text");
  });

  it("decodes ToolUseBlock", async () => {
    const { ContentBlock } = await import("../events");
    const raw = {
      type: "tool_use",
      id: "tool_123",
      name: "Read",
      input: { file: "foo.ts" },
    };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ContentBlock)(raw),
    );
    expect(result.type).toBe("tool_use");
    // @ts-expect-error — narrowing to ToolUseBlock
    expect(result.id).toBe("tool_123");
  });
});

describe("ContentDelta union", () => {
  it("decodes TextDelta", async () => {
    const { ContentDelta } = await import("../events");
    const raw = { type: "text_delta", text: " world" };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ContentDelta)(raw),
    );
    // @ts-expect-error — narrowing to TextDelta
    expect(result.text).toBe(" world");
  });

  it("decodes InputJsonDelta", async () => {
    const { ContentDelta } = await import("../events");
    const raw = { type: "input_json_delta", partial_json: '{"file":' };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ContentDelta)(raw),
    );
    // @ts-expect-error — narrowing to InputJsonDelta
    expect(result.partial_json).toBe('{"file":');
  });
});

describe("ApiStreamEvent union", () => {
  it("decodes MessageStartApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events");
    const raw = {
      type: "message_start",
      message: {
        id: "msg_01",
        type: "message",
        role: "assistant",
        content: [],
        model: "claude-opus-4-6",
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 25, output_tokens: 0 },
      },
    };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ApiStreamEvent)(raw),
    );
    expect(result.type).toBe("message_start");
  });

  it("decodes ContentBlockStartApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events");
    const raw = {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ApiStreamEvent)(raw),
    );
    expect(result.type).toBe("content_block_start");
  });

  it("decodes ContentBlockDeltaApiEvent with TextDelta", async () => {
    const { ApiStreamEvent } = await import("../events");
    const raw = {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Hello" },
    };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ApiStreamEvent)(raw),
    );
    expect(result.type).toBe("content_block_delta");
  });

  it("decodes ContentBlockStopApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events");
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ApiStreamEvent)({
        type: "content_block_stop",
        index: 0,
      }),
    );
    expect(result.type).toBe("content_block_stop");
  });

  it("decodes MessageDeltaApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events");
    const raw = {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 42 },
    };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ApiStreamEvent)(raw),
    );
    expect(result.type).toBe("message_delta");
  });

  it("decodes MessageStopApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events");
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ApiStreamEvent)({ type: "message_stop" }),
    );
    expect(result.type).toBe("message_stop");
  });
});

describe("ClaudeEvent union (CLI stream-json)", () => {
  it("decodes SystemInitEvent", async () => {
    const { ClaudeEvent } = await import("../events");
    const raw = {
      type: "system",
      subtype: "init",
      session_id: "sess_01",
      uuid: "uuid_01",
    };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ClaudeEvent)(raw),
    );
    expect(result.type).toBe("system");
  });

  it("decodes SystemRetryEvent", async () => {
    const { ClaudeEvent } = await import("../events");
    const raw = {
      type: "system",
      subtype: "api_retry",
      attempt: 1,
      max_retries: 3,
      retry_delay_ms: 1000,
      error_status: 429,
      error: "rate limited",
      uuid: "uuid_01",
      session_id: "sess_01",
    };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ClaudeEvent)(raw),
    );
    expect(result.type).toBe("system");
  });

  it("decodes AssistantMessageEvent", async () => {
    const { ClaudeEvent } = await import("../events");
    const raw = {
      type: "assistant",
      message: {
        id: "msg_01",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Hello!" }],
        model: "claude-opus-4-6",
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      uuid: "uuid_02",
      session_id: "sess_01",
    };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ClaudeEvent)(raw),
    );
    expect(result.type).toBe("assistant");
  });

  it("decodes ResultEvent", async () => {
    const { ClaudeEvent } = await import("../events");
    const raw = {
      type: "result",
      subtype: "success",
      result: "Final answer",
      is_error: false,
      session_id: "sess_01",
      uuid: "uuid_03",
      total_cost_usd: 0.002,
    };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ClaudeEvent)(raw),
    );
    expect(result.type).toBe("result");
  });

  it("decodes StreamEventMessage wrapping MessageStopApiEvent", async () => {
    const { ClaudeEvent } = await import("../events");
    const raw = {
      type: "stream_event",
      event: { type: "message_stop" },
      parent_tool_use_id: null,
      uuid: "uuid_01",
      session_id: "sess_01",
    };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ClaudeEvent)(raw),
    );
    expect(result.type).toBe("stream_event");
  });

  it("UnknownEvent catches unrecognised types without error", async () => {
    const { ClaudeEvent } = await import("../events");
    const raw = {
      type: "user",
      session_id: "sess_01",
      uuid: "uuid_01",
      content: [],
    };
    const result = await Effect.runPromise(
      Schema.decodeUnknown(ClaudeEvent)(raw),
    );
    expect(result.type).toBe("user");
  });
});
