import type { SqlClient as SqlClientNamespace } from "@effect/sql";
import { SqlClient } from "@effect/sql";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { Database } from "../../service-definition";
import { isUserMessage } from "../schemas";
import { makeEventStoreLive } from "../service";
import { EventStore } from "../service-definition";

// In-memory event store for mocking the SQL layer
interface InMemoryEvent {
  created_at: string;
  event_data: string;
  event_type: string;
  id: number;
  sequence_number: number;
  session_id: string;
}

const makeInMemoryDatabase = () => {
  let events: InMemoryEvent[] = [];
  let nextId = 1;

  // Mock SqlClient that intercepts tagged template calls and simulates SQL
  // The tagged template receives (strings, ...params) where strings is the
  // TemplateStringsArray and params are the interpolated values
  const sqlHandler = (
    strings: TemplateStringsArray,
    ...params: ReadonlyArray<unknown>
  ) => {
    const fullSql = strings.join("?").replace(/\s+/g, " ").trim();

    if (fullSql.includes("INSERT INTO events")) {
      const sessionId = params[0] as string;
      // params[1] is sessionId again (for the subselect), but the tagged template
      // flattens all interpolations in order: sessionId, sessionId, eventType, eventData
      const eventType = params[2] as string;
      const eventData = params[3] as string;
      const maxSeq = events
        .filter((e) => e.session_id === sessionId)
        .reduce((max, e) => Math.max(max, e.sequence_number), 0);
      events.push({
        id: nextId++,
        session_id: sessionId,
        sequence_number: maxSeq + 1,
        event_type: eventType,
        event_data: eventData,
        created_at: new Date().toISOString(),
      });
      return Effect.succeed([]);
    }

    if (fullSql.includes("SELECT") && fullSql.includes("FROM events")) {
      const sessionId = params[0] as string;
      const rows = events
        .filter((e) => e.session_id === sessionId)
        .sort((a, b) => a.sequence_number - b.sequence_number);
      return Effect.succeed(rows);
    }

    if (fullSql.includes("DELETE FROM events")) {
      const sessionId = params[0] as string;
      events = events.filter((e) => e.session_id !== sessionId);
      return Effect.succeed([]);
    }

    return Effect.succeed([]);
  };

  const mockSql = Object.assign(sqlHandler, {
    unsafe: (rawSql: string) => Effect.succeed([]),
    safe: undefined,
    withoutTransforms: () => mockSql,
    reserve: Effect.succeed({}),
    withTransaction: <R, E, A>(self: Effect.Effect<A, E, R>) => self,
  });

  return {
    reset: () => {
      events = [];
      nextId = 1;
    },
    layer: Layer.succeed(
      SqlClient.SqlClient,
      mockSql as unknown as SqlClientNamespace.SqlClient,
    ),
  };
};

const makeTestLayer = () => {
  const db = makeInMemoryDatabase();

  const testDatabaseLayer = Layer.effect(
    Database,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return { sql };
    }),
  );

  const testLayer = makeEventStoreLive().pipe(
    Layer.provide(testDatabaseLayer.pipe(Layer.provide(db.layer))),
  );

  return { reset: db.reset, layer: testLayer };
};

const { reset, layer: TestLayer } = makeTestLayer();

// Helper to run effects against the test layer
const runTest = <A, E>(effect: Effect.Effect<A, E, EventStore>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer), Effect.scoped));

describe("EventStore", () => {
  it("append inserts an event and getBySession retrieves it", async () => {
    reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore;
        yield* store.append(
          "session-1",
          "system",
          JSON.stringify({
            type: "system",
            subtype: "init",
            session_id: "session-1",
            uuid: "u1",
          }),
        );
        const events = yield* store.getBySession("session-1");
        return events;
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("system");
  });

  it("append auto-assigns sequence numbers starting from 1", async () => {
    reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore;
        yield* store.append(
          "session-seq",
          "system",
          JSON.stringify({
            type: "system",
            subtype: "init",
            session_id: "session-seq",
            uuid: "u1",
          }),
        );
        yield* store.append(
          "session-seq",
          "result",
          JSON.stringify({
            type: "result",
            subtype: "success",
            result: "done",
            is_error: false,
            session_id: "session-seq",
            uuid: "u2",
          }),
        );
        const events = yield* store.getBySession("session-seq");
        return events;
      }),
    );
    expect(result).toHaveLength(2);
  });

  it("append stores user_message events (EVNT-02)", async () => {
    reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore;
        yield* store.append(
          "session-um",
          "user_message",
          JSON.stringify({ type: "user_message", prompt: "hello" }),
        );
        const events = yield* store.getBySession("session-um");
        return events;
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("user_message");
    expect(isUserMessage(result[0])).toBe(true);
    if (isUserMessage(result[0])) {
      expect(result[0].prompt).toBe("hello");
    }
  });

  it("getBySession returns events in sequence_number order", async () => {
    reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore;
        yield* store.append(
          "session-order",
          "system",
          JSON.stringify({
            type: "system",
            subtype: "init",
            session_id: "session-order",
            uuid: "u1",
          }),
        );
        yield* store.append(
          "session-order",
          "user_message",
          JSON.stringify({ type: "user_message", prompt: "first" }),
        );
        yield* store.append(
          "session-order",
          "result",
          JSON.stringify({
            type: "result",
            subtype: "success",
            result: "done",
            is_error: false,
            session_id: "session-order",
            uuid: "u3",
          }),
        );
        const events = yield* store.getBySession("session-order");
        return events;
      }),
    );
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("system");
    expect(result[1].type).toBe("user_message");
    expect(result[2].type).toBe("result");
  });

  it("getBySession returns empty array for unknown session", async () => {
    reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore;
        const events = yield* store.getBySession("nonexistent-session");
        return events;
      }),
    );
    expect(result).toEqual([]);
  });

  it("getBySession partitions by session_id (EVNT-03)", async () => {
    reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore;
        yield* store.append(
          "session-A",
          "system",
          JSON.stringify({
            type: "system",
            subtype: "init",
            session_id: "session-A",
            uuid: "uA",
          }),
        );
        yield* store.append(
          "session-B",
          "user_message",
          JSON.stringify({ type: "user_message", prompt: "from B" }),
        );
        const eventsA = yield* store.getBySession("session-A");
        const eventsB = yield* store.getBySession("session-B");
        return { eventsA, eventsB };
      }),
    );
    expect(result.eventsA).toHaveLength(1);
    expect(result.eventsA[0].type).toBe("system");
    expect(result.eventsB).toHaveLength(1);
    expect(result.eventsB[0].type).toBe("user_message");
  });

  it("purgeSession deletes all events for session", async () => {
    reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore;
        yield* store.append(
          "session-purge",
          "system",
          JSON.stringify({
            type: "system",
            subtype: "init",
            session_id: "session-purge",
            uuid: "u1",
          }),
        );
        yield* store.append(
          "session-purge",
          "user_message",
          JSON.stringify({ type: "user_message", prompt: "bye" }),
        );
        yield* store.purgeSession("session-purge");
        const events = yield* store.getBySession("session-purge");
        return events;
      }),
    );
    expect(result).toEqual([]);
  });

  it("purgeSession does not affect other sessions", async () => {
    reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* EventStore;
        yield* store.append(
          "session-keep",
          "system",
          JSON.stringify({
            type: "system",
            subtype: "init",
            session_id: "session-keep",
            uuid: "uKeep",
          }),
        );
        yield* store.append(
          "session-remove",
          "user_message",
          JSON.stringify({ type: "user_message", prompt: "delete me" }),
        );
        yield* store.purgeSession("session-remove");
        const kept = yield* store.getBySession("session-keep");
        const removed = yield* store.getBySession("session-remove");
        return { kept, removed };
      }),
    );
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0].type).toBe("system");
    expect(result.removed).toEqual([]);
  });
});
