import { Chunk, Effect, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { DatabaseQueryError } from "../../../database/errors";
import { EventStore } from "../../../database/event-store/service-definition";
import { ClaudeCliProcessError } from "../../errors";
import {
  AssistantMessageEvent,
  MessageStartApiEvent,
  ResultEvent,
  StreamEventMessage,
  SystemInitEvent,
  TextBlock,
  UnknownEvent,
  Usage,
} from "../../events";
import { ContinueParams, QueryParams, ResumeParams } from "../../params";
import { ClaudeCli } from "../../service-definition";
import { makePersistentClaudeCliLive } from "../service";

// --- Fixtures ---

const testUsage = new Usage({});

const systemInitEvent = new SystemInitEvent({
  type: "system",
  subtype: "init",
  session_id: "test-session",
  uuid: "u1",
});

const streamEventMessage = new StreamEventMessage({
  type: "stream_event",
  event: new MessageStartApiEvent({
    type: "message_start",
    message: {
      id: "msg-1",
      type: "message",
      role: "assistant",
      content: [],
      model: "claude-sonnet-4-20250514",
      stop_reason: null,
      stop_sequence: null,
      usage: testUsage,
    },
  }),
  parent_tool_use_id: null,
  uuid: "u2",
  session_id: "test-session",
});

const assistantMessageEvent = new AssistantMessageEvent({
  type: "assistant",
  message: {
    id: "m1",
    type: "message",
    role: "assistant",
    content: [new TextBlock({ type: "text", text: "hello" })],
    model: "claude-sonnet-4-20250514",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: testUsage,
  },
  uuid: "u3",
  session_id: "test-session",
});

const resultEvent = new ResultEvent({
  type: "result",
  subtype: "success",
  result: "done",
  is_error: false,
  session_id: "test-session",
  uuid: "u4",
});

const unknownEvent = new UnknownEvent({
  type: "tool_result",
});

// --- Test helpers ---

interface AppendedEvent {
  eventData: string;
  eventType: string;
  sessionId: string;
}

interface CapturedCall {
  method: string;
  params: QueryParams | ResumeParams | ContinueParams;
}

const makeTestLayer = (
  mockEvents: ReadonlyArray<
    | SystemInitEvent
    | StreamEventMessage
    | AssistantMessageEvent
    | ResultEvent
    | UnknownEvent
  >,
  options?: {
    failingStore?: boolean;
    failStream?: boolean;
  },
) => {
  const appendedEvents: AppendedEvent[] = [];
  const capturedCalls: CapturedCall[] = [];

  const mockEventStore = Layer.succeed(EventStore, {
    append: (sessionId: string, eventType: string, eventData: string) => {
      if (options?.failingStore) {
        return Effect.fail(
          new DatabaseQueryError({
            cause: "disk full",
            message: "write failed",
          }),
        );
      }
      appendedEvents.push({ sessionId, eventType, eventData });
      return Effect.void;
    },
    getBySession: () => Effect.succeed([]),
    getBySessionWithMeta: () => Effect.succeed([]),
    purgeSession: () => Effect.void,
  });

  const mockInnerCli = Layer.succeed(ClaudeCli, {
    query: (params: QueryParams) => {
      capturedCalls.push({ method: "query", params });
      if (options?.failStream) {
        return Stream.concat(
          Stream.fromIterable(mockEvents),
          Stream.fail(
            new ClaudeCliProcessError({ exitCode: 1, stderr: "crash" }),
          ),
        );
      }
      return Stream.fromIterable(mockEvents);
    },
    resume: (params: ResumeParams) => {
      capturedCalls.push({ method: "resume", params });
      return Stream.fromIterable(mockEvents);
    },
    cont: (params: ContinueParams) => {
      capturedCalls.push({ method: "cont", params });
      return Stream.fromIterable(mockEvents);
    },
  });

  const testLayer = makePersistentClaudeCliLive().pipe(
    Layer.provide(mockInnerCli),
    Layer.provide(mockEventStore),
  );

  return { testLayer, appendedEvents, capturedCalls };
};

describe("PersistentClaudeCli", () => {
  describe("query", () => {
    it("persists only complete events", async () => {
      const { testLayer, appendedEvents } = makeTestLayer([
        systemInitEvent,
        streamEventMessage,
        assistantMessageEvent,
        resultEvent,
      ]);

      await Effect.runPromise(
        Effect.gen(function* () {
          const cli = yield* ClaudeCli;
          const params = new QueryParams({ prompt: "hello" });
          yield* Stream.runDrain(cli.query(params));
        }).pipe(Effect.provide(testLayer)),
      );

      const eventTypes = appendedEvents.map((e) => e.eventType);
      expect(eventTypes).toContain("user_message");
      expect(eventTypes).toContain("system");
      expect(eventTypes).toContain("assistant");
      expect(eventTypes).toContain("result");
      expect(eventTypes).not.toContain("stream_event");
    });

    it("discards StreamEventMessage and UnknownEvent", async () => {
      const { testLayer, appendedEvents } = makeTestLayer([
        systemInitEvent,
        streamEventMessage,
        streamEventMessage,
        unknownEvent,
      ]);

      await Effect.runPromise(
        Effect.gen(function* () {
          const cli = yield* ClaudeCli;
          const params = new QueryParams({ prompt: "hello" });
          yield* Stream.runDrain(cli.query(params));
        }).pipe(Effect.provide(testLayer)),
      );

      const eventTypes = appendedEvents.map((e) => e.eventType);
      // Only user_message (pre-stream) and system (from SystemInitEvent)
      expect(eventTypes).toEqual(["user_message", "system"]);
    });

    it("persists SystemInitEvent immediately", async () => {
      const { testLayer, appendedEvents } = makeTestLayer([
        systemInitEvent,
        assistantMessageEvent,
        resultEvent,
      ]);

      await Effect.runPromise(
        Effect.gen(function* () {
          const cli = yield* ClaudeCli;
          const params = new QueryParams({ prompt: "test prompt" });
          yield* Stream.runDrain(cli.query(params));
        }).pipe(Effect.provide(testLayer)),
      );

      // user_message is persisted before stream starts
      expect(appendedEvents[0].eventType).toBe("user_message");
      // SystemInitEvent is the first stream event persisted
      expect(appendedEvents[1].eventType).toBe("system");
    });

    it("pre-generates session_id UUID for query", async () => {
      const { testLayer, capturedCalls } = makeTestLayer([
        systemInitEvent,
        resultEvent,
      ]);

      await Effect.runPromise(
        Effect.gen(function* () {
          const cli = yield* ClaudeCli;
          const params = new QueryParams({ prompt: "hello" });
          yield* Stream.runDrain(cli.query(params));
        }).pipe(Effect.provide(testLayer)),
      );

      expect(capturedCalls).toHaveLength(1);
      const captured = capturedCalls[0];
      expect(captured.method).toBe("query");
      const queryParams = captured.params as QueryParams;
      // session_id should be set (not undefined)
      expect(queryParams.session_id).toBeDefined();
      // session_id should be a valid UUID format
      expect(queryParams.session_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe("resume", () => {
    it("persists user message for resume", async () => {
      const { testLayer, appendedEvents } = makeTestLayer([
        systemInitEvent,
        assistantMessageEvent,
        resultEvent,
      ]);

      await Effect.runPromise(
        Effect.gen(function* () {
          const cli = yield* ClaudeCli;
          const params = new ResumeParams({
            prompt: "resume prompt",
            session_id: "known-session",
          });
          yield* Stream.runDrain(cli.resume(params));
        }).pipe(Effect.provide(testLayer)),
      );

      // user_message persisted with the known session_id
      const userMsg = appendedEvents.find(
        (e) => e.eventType === "user_message",
      );
      expect(userMsg).toBeDefined();
      expect(userMsg?.sessionId).toBe("known-session");

      // Stream events also persisted with the same session_id
      const streamEvents = appendedEvents.filter(
        (e) => e.eventType !== "user_message",
      );
      for (const evt of streamEvents) {
        expect(evt.sessionId).toBe("known-session");
      }
    });
  });

  describe("cont", () => {
    it("extracts session_id from SystemInitEvent for cont", async () => {
      const { testLayer, appendedEvents } = makeTestLayer([
        systemInitEvent,
        assistantMessageEvent,
        resultEvent,
      ]);

      await Effect.runPromise(
        Effect.gen(function* () {
          const cli = yield* ClaudeCli;
          const params = new ContinueParams({ prompt: "continue" });
          yield* Stream.runDrain(cli.cont(params));
        }).pipe(Effect.provide(testLayer)),
      );

      // For cont, user_message comes AFTER SystemInitEvent
      const systemIdx = appendedEvents.findIndex(
        (e) => e.eventType === "system",
      );
      const userMsgIdx = appendedEvents.findIndex(
        (e) => e.eventType === "user_message",
      );
      expect(systemIdx).toBeGreaterThanOrEqual(0);
      expect(userMsgIdx).toBeGreaterThan(systemIdx);

      // All events use the session_id from the SystemInitEvent
      for (const evt of appendedEvents) {
        expect(evt.sessionId).toBe("test-session");
      }
    });
  });

  describe("transparency", () => {
    it("stream output is transparent", async () => {
      const allEvents = [
        systemInitEvent,
        streamEventMessage,
        assistantMessageEvent,
        resultEvent,
      ] as const;

      const { testLayer } = makeTestLayer([...allEvents]);

      const collected = await Effect.runPromise(
        Effect.gen(function* () {
          const cli = yield* ClaudeCli;
          const params = new QueryParams({ prompt: "hello" });
          return yield* Stream.runCollect(cli.query(params));
        }).pipe(Effect.provide(testLayer)),
      );

      const output = Chunk.toArray(collected);
      // All 4 events should be in the output, in exact order
      expect(output).toHaveLength(4);
      expect(output[0]).toEqual(systemInitEvent);
      expect(output[1]).toEqual(streamEventMessage);
      expect(output[2]).toEqual(assistantMessageEvent);
      expect(output[3]).toEqual(resultEvent);
    });
  });

  describe("write failure handling", () => {
    it("swallows write failures", async () => {
      const { testLayer } = makeTestLayer(
        [systemInitEvent, assistantMessageEvent, resultEvent],
        { failingStore: true },
      );

      const collected = await Effect.runPromise(
        Effect.gen(function* () {
          const cli = yield* ClaudeCli;
          const params = new QueryParams({ prompt: "hello" });
          return yield* Stream.runCollect(cli.query(params));
        }).pipe(Effect.provide(testLayer)),
      );

      const output = Chunk.toArray(collected);
      // Stream should still emit all events despite write failures
      expect(output).toHaveLength(3);
      expect(output[0]).toEqual(systemInitEvent);
      expect(output[1]).toEqual(assistantMessageEvent);
      expect(output[2]).toEqual(resultEvent);
    });
  });

  describe("termination", () => {
    it("no partial data on stream failure", async () => {
      const { testLayer, appendedEvents } = makeTestLayer([systemInitEvent], {
        failStream: true,
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const cli = yield* ClaudeCli;
          const params = new QueryParams({ prompt: "hello" });
          return yield* cli
            .query(params)
            .pipe(Stream.runCollect, Effect.either);
        }).pipe(Effect.provide(testLayer)),
      );

      // Stream should fail
      expect(result._tag).toBe("Left");

      // Only user_message and SystemInitEvent should be persisted
      // (valid complete events — no partial data)
      const eventTypes = appendedEvents.map((e) => e.eventType);
      expect(eventTypes).toContain("user_message");
      expect(eventTypes).toContain("system");
      expect(eventTypes).toHaveLength(2);
    });
  });
});
