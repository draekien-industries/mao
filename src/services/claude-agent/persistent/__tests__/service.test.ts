import { Chunk, Effect, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { DatabaseQueryError } from "../../../database/errors";
import { EventStore } from "../../../database/event-store/service-definition";
import { ClaudeAgentProcessError } from "../../errors";
import {
  SDKAssistantMessage,
  SDKResultMessage,
  SDKSystemInitMessage,
  SDKUserMessage,
  TextBlock,
  ToolResultBlock,
  Usage,
} from "../../events";
import { ContinueParams, QueryParams, ResumeParams } from "../../params";
import { ClaudeAgent } from "../../service-definition";
import { makePersistentClaudeAgentLive } from "../service";

// --- Fixtures ---

const testUsage = new Usage({});

const systemInitEvent = new SDKSystemInitMessage({
  type: "system",
  subtype: "init",
  session_id: "test-session",
  uuid: "u1",
  tools: [],
  model: "claude-sonnet-4-20250514",
  permissionMode: "default",
  cwd: "/tmp",
  apiKeySource: "env",
});

const assistantMessageEvent = new SDKAssistantMessage({
  type: "assistant",
  uuid: "u3",
  session_id: "test-session",
  parent_tool_use_id: null,
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
});

const resultEvent = new SDKResultMessage({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "done",
  session_id: "test-session",
  uuid: "u4",
  duration_ms: 100,
  duration_api_ms: 80,
  num_turns: 1,
  total_cost_usd: 0.001,
  usage: testUsage,
});

const userEvent = new SDKUserMessage({
  type: "user",
  session_id: "test-session",
  parent_tool_use_id: null,
  message: {
    role: "user",
    content: [
      new ToolResultBlock({
        type: "tool_result",
        tool_use_id: "toolu_1",
        content: "file contents",
      }),
    ],
  },
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
    | SDKSystemInitMessage
    | SDKAssistantMessage
    | SDKResultMessage
    | SDKUserMessage
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

  const mockInnerAgent = Layer.succeed(ClaudeAgent, {
    query: (params: QueryParams) => {
      capturedCalls.push({ method: "query", params });
      if (options?.failStream) {
        return Stream.concat(
          Stream.fromIterable(mockEvents),
          Stream.fail(
            new ClaudeAgentProcessError({
              message: "crashed",
              cause: "signal",
            }),
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

  const testLayer = makePersistentClaudeAgentLive().pipe(
    Layer.provide(mockInnerAgent),
    Layer.provide(mockEventStore),
  );

  return { testLayer, appendedEvents, capturedCalls };
};

describe("PersistentClaudeAgent", () => {
  describe("query", () => {
    it("persists user_message before stream, then system/assistant/result events", async () => {
      const { testLayer, appendedEvents } = makeTestLayer([
        systemInitEvent,
        assistantMessageEvent,
        resultEvent,
      ]);

      await Effect.runPromise(
        Effect.gen(function* () {
          const agent = yield* ClaudeAgent;
          const params = new QueryParams({ prompt: "hello" });
          yield* Stream.runDrain(agent.query(params));
        }).pipe(Effect.provide(testLayer)),
      );

      const eventTypes = appendedEvents.map((e) => e.eventType);
      expect(eventTypes).toContain("user_message");
      expect(eventTypes).toContain("system");
      expect(eventTypes).toContain("assistant");
      expect(eventTypes).toContain("result");
      expect(appendedEvents[0].eventType).toBe("user_message");
    });

    it("pre-generates session_id UUID for query", async () => {
      const { testLayer, capturedCalls } = makeTestLayer([
        systemInitEvent,
        resultEvent,
      ]);

      await Effect.runPromise(
        Effect.gen(function* () {
          const agent = yield* ClaudeAgent;
          const params = new QueryParams({ prompt: "hello" });
          yield* Stream.runDrain(agent.query(params));
        }).pipe(Effect.provide(testLayer)),
      );

      expect(capturedCalls).toHaveLength(1);
      const queryParams = capturedCalls[0].params as QueryParams;
      expect(queryParams.session_id).toBeDefined();
      expect(queryParams.session_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("stream output is transparent", async () => {
      const allEvents = [
        systemInitEvent,
        assistantMessageEvent,
        resultEvent,
      ] as const;

      const { testLayer } = makeTestLayer([...allEvents]);

      const collected = await Effect.runPromise(
        Effect.gen(function* () {
          const agent = yield* ClaudeAgent;
          const params = new QueryParams({ prompt: "hello" });
          return yield* Stream.runCollect(agent.query(params));
        }).pipe(Effect.provide(testLayer)),
      );

      const output = Chunk.toArray(collected);
      expect(output).toHaveLength(3);
      expect(output[0]).toEqual(systemInitEvent);
      expect(output[1]).toEqual(assistantMessageEvent);
      expect(output[2]).toEqual(resultEvent);
    });

    it("swallows write failures without failing the stream", async () => {
      const { testLayer } = makeTestLayer(
        [systemInitEvent, assistantMessageEvent, resultEvent],
        { failingStore: true },
      );

      const collected = await Effect.runPromise(
        Effect.gen(function* () {
          const agent = yield* ClaudeAgent;
          const params = new QueryParams({ prompt: "hello" });
          return yield* Stream.runCollect(agent.query(params));
        }).pipe(Effect.provide(testLayer)),
      );

      const output = Chunk.toArray(collected);
      expect(output).toHaveLength(3);
    });
  });

  describe("resume", () => {
    it("persists user_message with provided session_id", async () => {
      const { testLayer, appendedEvents } = makeTestLayer([
        systemInitEvent,
        assistantMessageEvent,
        resultEvent,
      ]);

      await Effect.runPromise(
        Effect.gen(function* () {
          const agent = yield* ClaudeAgent;
          const params = new ResumeParams({
            prompt: "resume prompt",
            session_id: "known-session",
          });
          yield* Stream.runDrain(agent.resume(params));
        }).pipe(Effect.provide(testLayer)),
      );

      const userMsg = appendedEvents.find(
        (e) => e.eventType === "user_message",
      );
      expect(userMsg).toBeDefined();
      expect(userMsg?.sessionId).toBe("known-session");

      const streamEvents = appendedEvents.filter(
        (e) => e.eventType !== "user_message",
      );
      for (const evt of streamEvents) {
        expect(evt.sessionId).toBe("known-session");
      }
    });
  });

  describe("cont", () => {
    it("captures session_id from first system init message", async () => {
      const { testLayer, appendedEvents } = makeTestLayer([
        systemInitEvent,
        assistantMessageEvent,
        resultEvent,
      ]);

      await Effect.runPromise(
        Effect.gen(function* () {
          const agent = yield* ClaudeAgent;
          const params = new ContinueParams({ prompt: "continue" });
          yield* Stream.runDrain(agent.cont(params));
        }).pipe(Effect.provide(testLayer)),
      );

      const systemIdx = appendedEvents.findIndex(
        (e) => e.eventType === "system",
      );
      const userMsgIdx = appendedEvents.findIndex(
        (e) => e.eventType === "user_message",
      );
      expect(systemIdx).toBeGreaterThanOrEqual(0);
      expect(userMsgIdx).toBeGreaterThan(systemIdx);

      for (const evt of appendedEvents) {
        expect(evt.sessionId).toBe("test-session");
      }
    });

    it("persists user event from SDKUserMessage in cont", async () => {
      const { testLayer, appendedEvents } = makeTestLayer([
        systemInitEvent,
        userEvent,
        assistantMessageEvent,
        resultEvent,
      ]);

      await Effect.runPromise(
        Effect.gen(function* () {
          const agent = yield* ClaudeAgent;
          const params = new ContinueParams({ prompt: "continue" });
          yield* Stream.runDrain(agent.cont(params));
        }).pipe(Effect.provide(testLayer)),
      );

      const eventTypes = appendedEvents.map((e) => e.eventType);
      expect(eventTypes).toContain("user");
    });
  });
});
