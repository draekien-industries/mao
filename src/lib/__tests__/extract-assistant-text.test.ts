import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  AssistantMessageEvent,
  TextBlock,
  ToolUseBlock,
} from "@/services/claude-cli/events";
import { extractAssistantText } from "../extract-assistant-text";

const decode = Schema.decodeUnknownSync(AssistantMessageEvent);

const makeEvent = (content: ReadonlyArray<TextBlock | ToolUseBlock>) =>
  decode({
    type: "assistant",
    message: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      content,
      model: "claude-sonnet-4-20250514",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {},
    },
    uuid: "uuid-1",
    session_id: "session-1",
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
});
