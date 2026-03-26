import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { ChatMessage, ReconstructedSession } from "../schemas";

describe("ChatMessage", () => {
  const decode = Schema.decodeUnknownSync(ChatMessage);
  const encode = Schema.encodeSync(ChatMessage);

  it("round-trips a valid user message", () => {
    const input = {
      id: 1,
      role: "user",
      content: "Hello",
      createdAt: "2026-03-26T00:00:00Z",
    };
    const decoded = decode(input);
    const encoded = encode(decoded);
    expect(encoded).toEqual(input);
  });

  it("round-trips a valid assistant message", () => {
    const input = {
      id: 2,
      role: "assistant",
      content: "Hi there",
      createdAt: "2026-03-26T00:00:01Z",
    };
    const decoded = decode(input);
    const encoded = encode(decoded);
    expect(encoded).toEqual(input);
  });

  it("rejects invalid role value", () => {
    expect(() =>
      decode({
        id: 3,
        role: "system",
        content: "nope",
        createdAt: "2026-03-26T00:00:00Z",
      }),
    ).toThrow();
  });

  it("rejects missing required field", () => {
    expect(() =>
      decode({
        id: 4,
        role: "user",
        // content missing
        createdAt: "2026-03-26T00:00:00Z",
      }),
    ).toThrow();
  });
});

describe("ReconstructedSession", () => {
  const decode = Schema.decodeUnknownSync(ReconstructedSession);
  const encode = Schema.encodeSync(ReconstructedSession);

  it("round-trips a valid session with messages", () => {
    const input = {
      sessionId: "session-1",
      messages: [
        {
          id: 1,
          role: "user" as const,
          content: "Hello",
          createdAt: "2026-03-26T00:00:00Z",
        },
        {
          id: 2,
          role: "assistant" as const,
          content: "Hi there",
          createdAt: "2026-03-26T00:00:01Z",
        },
      ],
    };
    const decoded = decode(input);
    const encoded = encode(decoded);
    expect(encoded).toEqual(input);
  });

  it("round-trips a session with empty messages array", () => {
    const input = {
      sessionId: "session-empty",
      messages: [],
    };
    const decoded = decode(input);
    const encoded = encode(decoded);
    expect(encoded).toEqual(input);
  });
});
