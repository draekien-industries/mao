import { Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  AssistantMessageEvent,
  ResultEvent,
  SystemInitEvent,
  SystemRetryEvent,
  TextBlock,
  UnknownEvent,
  Usage,
} from "../../../claude-cli/events";
import type { StoredEventWithMeta } from "../../event-store/schemas";
import { UserMessageEvent } from "../../event-store/schemas";
import { EventStore } from "../../event-store/service-definition";
import { makeSessionReconstructorLive } from "../service";
import { SessionReconstructor } from "../service-definition";

// --- Fixtures ---

const testUsage = new Usage({});

const makeSystemInit = (sessionId: string): SystemInitEvent =>
  new SystemInitEvent({
    type: "system",
    subtype: "init",
    session_id: sessionId,
    uuid: "u-init",
  });

const makeUserMessage = (prompt: string): UserMessageEvent =>
  new UserMessageEvent({
    type: "user_message",
    prompt,
  });

const makeAssistantMessage = (text: string): AssistantMessageEvent =>
  Schema.decodeUnknownSync(AssistantMessageEvent)({
    type: "assistant",
    message: {
      id: "msg-1",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      model: "claude-sonnet-4-20250514",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: testUsage,
    },
    uuid: "u-asst",
    session_id: "session-1",
  });

const makeResult = (): ResultEvent =>
  new ResultEvent({
    type: "result",
    subtype: "success",
    result: "done",
    is_error: false,
    session_id: "session-1",
    uuid: "u-result",
  });

const makeRetry = (): SystemRetryEvent =>
  new SystemRetryEvent({
    type: "system",
    subtype: "api_retry",
    attempt: 1,
    max_retries: 3,
    retry_delay_ms: 1000,
    error_status: 500,
    error: "server error",
    uuid: "u-retry",
    session_id: "session-1",
  });

const makeUnknown = (): UnknownEvent =>
  new UnknownEvent({
    type: "tool_result",
  });

const toRow = (
  event: StoredEventWithMeta["event"],
  sequenceNumber: number,
  createdAt = "2026-01-01T00:00:00.000Z",
): StoredEventWithMeta => ({
  createdAt,
  event,
  sequenceNumber,
});

// --- Test layer ---

const makeTestLayer = (rows: ReadonlyArray<StoredEventWithMeta>) => {
  const mockEventStore = Layer.succeed(EventStore, {
    append: () => Effect.void,
    getBySession: () => Effect.succeed([]),
    getBySessionWithMeta: () => Effect.succeed(rows),
    purgeSession: () => Effect.void,
  });

  return makeSessionReconstructorLive().pipe(Layer.provide(mockEventStore));
};

const runTest = <A, E>(
  rows: ReadonlyArray<StoredEventWithMeta>,
  effect: Effect.Effect<A, E, SessionReconstructor>,
) => Effect.runPromise(effect.pipe(Effect.provide(makeTestLayer(rows))));

// --- Tests ---

describe("SessionReconstructor", () => {
  it("reconstructs a full conversation with user and assistant messages", async () => {
    const rows: StoredEventWithMeta[] = [
      toRow(makeSystemInit("real-session-id"), 1, "2026-01-01T00:00:00Z"),
      toRow(makeUserMessage("hello"), 2, "2026-01-01T00:00:01Z"),
      toRow(makeAssistantMessage("hi there"), 3, "2026-01-01T00:00:02Z"),
      toRow(makeResult(), 4, "2026-01-01T00:00:03Z"),
    ];

    const result = await runTest(
      rows,
      Effect.gen(function* () {
        const svc = yield* SessionReconstructor;
        return yield* svc.reconstruct("session-1");
      }),
    );

    expect(result.sessionId).toBe("real-session-id");
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content).toBe("hello");
    expect(result.messages[0].id).toBe(2);
    expect(result.messages[0].createdAt).toBe("2026-01-01T00:00:01Z");
    expect(result.messages[1].role).toBe("assistant");
    expect(result.messages[1].content).toBe("hi there");
    expect(result.messages[1].id).toBe(3);
    expect(result.messages[1].createdAt).toBe("2026-01-01T00:00:02Z");
  });

  it("returns empty messages for SystemInitEvent-only session", async () => {
    const rows: StoredEventWithMeta[] = [toRow(makeSystemInit("init-only"), 1)];

    const result = await runTest(
      rows,
      Effect.gen(function* () {
        const svc = yield* SessionReconstructor;
        return yield* svc.reconstruct("session-1");
      }),
    );

    expect(result.sessionId).toBe("init-only");
    expect(result.messages).toEqual([]);
  });

  it("handles incomplete session (user message with no assistant response)", async () => {
    const rows: StoredEventWithMeta[] = [
      toRow(makeSystemInit("incomplete-session"), 1),
      toRow(makeUserMessage("waiting for reply"), 2, "2026-01-01T00:00:01Z"),
    ];

    const result = await runTest(
      rows,
      Effect.gen(function* () {
        const svc = yield* SessionReconstructor;
        return yield* svc.reconstruct("session-1");
      }),
    );

    expect(result.sessionId).toBe("incomplete-session");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content).toBe("waiting for reply");
  });

  it("reconstructs multi-turn conversation with 4 messages in order", async () => {
    const rows: StoredEventWithMeta[] = [
      toRow(makeSystemInit("multi-turn"), 1),
      toRow(makeUserMessage("first question"), 2, "2026-01-01T00:00:01Z"),
      toRow(makeAssistantMessage("first answer"), 3, "2026-01-01T00:00:02Z"),
      toRow(makeUserMessage("second question"), 4, "2026-01-01T00:00:03Z"),
      toRow(makeAssistantMessage("second answer"), 5, "2026-01-01T00:00:04Z"),
    ];

    const result = await runTest(
      rows,
      Effect.gen(function* () {
        const svc = yield* SessionReconstructor;
        return yield* svc.reconstruct("session-1");
      }),
    );

    expect(result.sessionId).toBe("multi-turn");
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0]).toMatchObject({
      content: "first question",
      id: 2,
      role: "user",
    });
    expect(result.messages[1]).toMatchObject({
      content: "first answer",
      id: 3,
      role: "assistant",
    });
    expect(result.messages[2]).toMatchObject({
      content: "second question",
      id: 4,
      role: "user",
    });
    expect(result.messages[3]).toMatchObject({
      content: "second answer",
      id: 5,
      role: "assistant",
    });
  });

  it("skips SystemRetryEvent (not in messages)", async () => {
    const rows: StoredEventWithMeta[] = [
      toRow(makeSystemInit("retry-session"), 1),
      toRow(makeRetry(), 2),
      toRow(makeUserMessage("after retry"), 3, "2026-01-01T00:00:01Z"),
      toRow(makeAssistantMessage("response"), 4, "2026-01-01T00:00:02Z"),
    ];

    const result = await runTest(
      rows,
      Effect.gen(function* () {
        const svc = yield* SessionReconstructor;
        return yield* svc.reconstruct("session-1");
      }),
    );

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[1].role).toBe("assistant");
  });

  it("skips UnknownEvent (not in messages)", async () => {
    const rows: StoredEventWithMeta[] = [
      toRow(makeSystemInit("unknown-session"), 1),
      toRow(makeUserMessage("prompt"), 2, "2026-01-01T00:00:01Z"),
      toRow(makeUnknown(), 3),
      toRow(makeAssistantMessage("reply"), 4, "2026-01-01T00:00:02Z"),
    ];

    const result = await runTest(
      rows,
      Effect.gen(function* () {
        const svc = yield* SessionReconstructor;
        return yield* svc.reconstruct("session-1");
      }),
    );

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].content).toBe("prompt");
    expect(result.messages[1].content).toBe("reply");
  });

  it("uses sequenceNumber as id and createdAt from row metadata", async () => {
    const rows: StoredEventWithMeta[] = [
      toRow(makeSystemInit("meta-session"), 1),
      toRow(makeUserMessage("msg"), 42, "2026-03-15T10:30:00Z"),
    ];

    const result = await runTest(
      rows,
      Effect.gen(function* () {
        const svc = yield* SessionReconstructor;
        return yield* svc.reconstruct("session-1");
      }),
    );

    expect(result.messages[0].id).toBe(42);
    expect(result.messages[0].createdAt).toBe("2026-03-15T10:30:00Z");
  });

  it("returns fallback session when getBySessionWithMeta returns empty array", async () => {
    const result = await runTest(
      [],
      Effect.gen(function* () {
        const svc = yield* SessionReconstructor;
        return yield* svc.reconstruct("nonexistent");
      }),
    );

    expect(result.sessionId).toBe("nonexistent");
    expect(result.messages).toEqual([]);
  });
});
