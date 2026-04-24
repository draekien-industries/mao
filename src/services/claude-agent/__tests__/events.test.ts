import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  isAssistantMessage,
  isPartialAssistantMessage,
  isResultMessage,
  isSystemInitMessage,
  isUserMessage,
  SDKAssistantMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKSystemInitMessage,
  SDKUserMessage,
} from "../events";

const decode = Schema.decodeUnknownSync(SDKMessage);

describe("SDKMessage schema", () => {
  it("decodes system init", () => {
    const raw = {
      type: "system",
      subtype: "init",
      uuid: "u-1",
      session_id: "s-1",
      tools: ["Read"],
      model: "claude-sonnet-4-6",
      permissionMode: "default",
    };
    const result = decode(raw);
    expect(isSystemInitMessage(result)).toBe(true);
  });

  it("decodes assistant message", () => {
    const raw = {
      type: "assistant",
      uuid: "u-2",
      session_id: "s-1",
      parent_tool_use_id: null,
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "hi" }],
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 3 },
      },
    };
    const result = decode(raw);
    expect(isAssistantMessage(result)).toBe(true);
  });

  it("decodes partial assistant (stream_event)", () => {
    const raw = {
      type: "stream_event",
      uuid: "u-3",
      session_id: "s-1",
      parent_tool_use_id: null,
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "hel" },
      },
    };
    const result = decode(raw);
    expect(isPartialAssistantMessage(result)).toBe(true);
  });

  it("decodes tool_result user message", () => {
    const raw = {
      type: "user",
      uuid: "u-4",
      session_id: "s-1",
      parent_tool_use_id: "tu-1",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tu-1", content: "ok" }],
      },
    };
    const result = decode(raw);
    expect(isUserMessage(result)).toBe(true);
  });

  it("decodes success result", () => {
    const raw = {
      type: "result",
      subtype: "success",
      uuid: "u-5",
      session_id: "s-1",
      duration_ms: 100,
      duration_api_ms: 90,
      is_error: false,
      num_turns: 1,
      result: "done",
      total_cost_usd: 0.0012,
      usage: { input_tokens: 10, output_tokens: 3 },
    };
    const result = decode(raw);
    expect(isResultMessage(result)).toBe(true);
  });

  it("falls through to unknown for unrecognized variants", () => {
    const raw = { type: "status", session_id: "s-1", foo: "bar" };
    const result = decode(raw);
    expect(result.type).toBe("status");
  });
});

// Suppress unused import warnings — these are imported to verify they export correctly
void SDKAssistantMessage;
void SDKPartialAssistantMessage;
void SDKResultMessage;
void SDKSystemInitMessage;
void SDKUserMessage;
