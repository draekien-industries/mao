import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { SDKSystemInitMessage } from "../../../claude-agent/events";
import { isUserMessage, StoredEvent, UserMessageEvent } from "../schemas";

describe("UserMessageEvent", () => {
  it("decodes a valid user_message payload", () => {
    const result = Schema.decodeUnknownSync(UserMessageEvent)({
      type: "user_message",
      prompt: "hello",
    });
    expect(result.type).toBe("user_message");
    expect(result.prompt).toBe("hello");
  });

  it("has type property equal to 'user_message'", () => {
    const event = new UserMessageEvent({
      type: "user_message",
      prompt: "test",
    });
    expect(event.type).toBe("user_message");
  });
});

describe("StoredEvent", () => {
  it("decodes a SDKSystemInitMessage payload", () => {
    const result = Schema.decodeUnknownSync(StoredEvent)({
      type: "system",
      subtype: "init",
      uuid: "u1",
      session_id: "s1",
      tools: [],
      model: "claude-sonnet-4-6",
      permissionMode: "default",
      cwd: "/home/user",
      apiKeySource: "user",
    });
    expect(result.type).toBe("system");
  });

  it("decodes a UserMessageEvent payload", () => {
    const result = Schema.decodeUnknownSync(StoredEvent)({
      type: "user_message",
      prompt: "test",
    });
    expect(result.type).toBe("user_message");
  });

  it("decodes an unknown event type via catchall", () => {
    const result = Schema.decodeUnknownSync(StoredEvent)({
      type: "some_new_type",
    });
    expect(result.type).toBe("some_new_type");
  });
});

describe("isUserMessage", () => {
  it("returns true for a UserMessageEvent instance", () => {
    const event = new UserMessageEvent({
      type: "user_message",
      prompt: "hello",
    });
    expect(isUserMessage(event)).toBe(true);
  });

  it("returns false for a SDKSystemInitMessage instance", () => {
    const event = new SDKSystemInitMessage({
      type: "system",
      subtype: "init",
      uuid: "u1",
      session_id: "s1",
      tools: [],
      model: "claude-sonnet-4-6",
      permissionMode: "default",
      cwd: "/home/user",
      apiKeySource: "user",
    });
    expect(isUserMessage(event)).toBe(false);
  });
});
