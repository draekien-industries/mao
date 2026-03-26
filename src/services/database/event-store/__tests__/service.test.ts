import { SqlClient } from "@effect/sql";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  EVENTS_SESSION_INDEX_SQL,
  EVENTS_TABLE_SQL,
} from "../../schema";
import { Database } from "../../service-definition";
import { makeEventStoreLive } from "../service";
import { EventStore } from "../service-definition";

// Create in-memory SQLite with schema bootstrapped
const TestSqliteLayer = SqliteClient.layer({ filename: ":memory:" });

const TestDatabaseLayer = Layer.effect(
  Database,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.unsafe(EVENTS_TABLE_SQL);
    yield* sql.unsafe(EVENTS_SESSION_INDEX_SQL);
    return { sql };
  }),
);

const TestLayer = makeEventStoreLive().pipe(
  Layer.provide(
    TestDatabaseLayer.pipe(Layer.provide(TestSqliteLayer)),
  ),
);

// Helper to run effects against the test layer
const runTest = <A, E>(effect: Effect.Effect<A, E, EventStore>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer), Effect.scoped));

describe("EventStore", () => {
  it("append inserts an event and getBySession retrieves it", async () => {
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
    if (result[0].type === "user_message") {
      expect(result[0].prompt).toBe("hello");
    }
  });

  it("getBySession returns events in sequence_number order", async () => {
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
