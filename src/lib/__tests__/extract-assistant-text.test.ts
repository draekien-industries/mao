import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  SDKAssistantMessage,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  Usage,
} from "@/services/claude-agent/events";
import { extractAssistantText } from "../extract-assistant-text";

const decode = Schema.decodeUnknownSync(SDKAssistantMessage);

const testUsage = new Usage({});

const makeEvent = (
  content: ReadonlyArray<TextBlock | ToolUseBlock | ThinkingBlock>,
) =>
  decode({
    type: "assistant",
    uuid: "uuid-1",
    session_id: "session-1",
    parent_tool_use_id: null,
    message: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      content,
      model: "claude-sonnet-4-20250514",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: testUsage,
    },
  });

describe("extractAssistantText", () => {
  it("returns text from a single TextBlock", () => {
    const event = makeEvent([{ type: "text", text: "Hello world" }]);
    expect(extractAssistantText(event)).toBe("Hello world");
  });

  it("joins multiple TextBlocks without separator", () => {
    const event = makeEvent([
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ]);
    expect(extractAssistantText(event)).toBe("Hello world");
  });

  it("returns empty string when only ToolUseBlocks are present", () => {
    const event = makeEvent([
      { type: "tool_use", id: "tool_1", name: "read_file", input: {} },
    ]);
    expect(extractAssistantText(event)).toBe("");
  });

  it("returns only text portions from mixed content", () => {
    const event = makeEvent([
      { type: "text", text: "Before tool " },
      { type: "tool_use", id: "tool_1", name: "read_file", input: {} },
      { type: "text", text: "After tool" },
    ]);
    expect(extractAssistantText(event)).toBe("Before tool After tool");
  });

  it("returns empty string when only ThinkingBlocks are present", () => {
    const event = makeEvent([
      { type: "thinking", thinking: "internal reasoning" },
    ]);
    expect(extractAssistantText(event)).toBe("");
  });
});
