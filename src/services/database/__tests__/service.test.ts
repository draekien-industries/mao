import { SqlClient } from "@effect/sql";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  EVENTS_SESSION_INDEX_SQL,
  EVENTS_TABLE_SQL,
  TABS_TABLE_SQL,
} from "../schema";
import { makeDatabaseLive } from "../service";
import { Database } from "../service-definition";

const makeMockSqlClient = (
  handler: (sql: string) => Effect.Effect<ReadonlyArray<unknown>, unknown>,
) => {
  const calls: string[] = [];
  return {
    calls,
    layer: Layer.succeed(SqlClient.SqlClient, {
      unsafe: (sqlString: string) => {
        calls.push(sqlString);
        return handler(sqlString);
      },
    } as any),
  };
};

const healthyHandler = (sql: string) => {
  if (sql === "PRAGMA quick_check") {
    return Effect.succeed([{ quick_check: "ok" }]);
  }
  return Effect.succeed([]);
};

const corruptHandler = (sql: string) => {
  if (sql === "PRAGMA quick_check") {
    return Effect.succeed([{ quick_check: "bad" }]);
  }
  return Effect.succeed([]);
};

const makeTestLayer = (
  handler: (sql: string) => Effect.Effect<ReadonlyArray<unknown>, unknown>,
) => {
  const mock = makeMockSqlClient(handler);
  const testLayer = makeDatabaseLive().pipe(Layer.provide(mock.layer));
  return { calls: mock.calls, layer: testLayer };
};

describe("makeDatabaseLive", () => {
  it("constructs successfully and provides Database service", async () => {
    const { layer } = makeTestLayer(healthyHandler);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        return db.sql;
      }).pipe(Effect.provide(layer), Effect.scoped),
    );
    expect(result).toBeDefined();
  });

  it("runs integrity check (PRAGMA quick_check)", async () => {
    const { calls, layer } = makeTestLayer(healthyHandler);
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Database;
      }).pipe(Effect.provide(layer), Effect.scoped),
    );
    expect(calls).toContain("PRAGMA quick_check");
  });

  it("bootstraps events table", async () => {
    const { calls, layer } = makeTestLayer(healthyHandler);
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Database;
      }).pipe(Effect.provide(layer), Effect.scoped),
    );
    expect(calls).toContain(EVENTS_TABLE_SQL);
  });

  it("bootstraps tabs table", async () => {
    const { calls, layer } = makeTestLayer(healthyHandler);
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Database;
      }).pipe(Effect.provide(layer), Effect.scoped),
    );
    expect(calls).toContain(TABS_TABLE_SQL);
  });

  it("creates events session index", async () => {
    const { calls, layer } = makeTestLayer(healthyHandler);
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Database;
      }).pipe(Effect.provide(layer), Effect.scoped),
    );
    expect(calls).toContain(EVENTS_SESSION_INDEX_SQL);
  });

  it("yields DatabaseCorruptionError when integrity check fails", async () => {
    const { layer } = makeTestLayer(corruptHandler);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* Database;
      }).pipe(Effect.provide(layer), Effect.scoped, Effect.either),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect((result.left as any)._tag).toBe("DatabaseCorruptionError");
    }
  });

  it("wraps schema bootstrap failure as DatabaseQueryError", async () => {
    const failOnCreateHandler = (sql: string) => {
      if (sql === "PRAGMA quick_check") {
        return Effect.succeed([{ quick_check: "ok" }]);
      }
      if (sql.includes("CREATE TABLE")) {
        return Effect.fail(new Error("SQL execution failed"));
      }
      return Effect.succeed([]);
    };
    const { layer } = makeTestLayer(failOnCreateHandler);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* Database;
      }).pipe(Effect.provide(layer), Effect.scoped, Effect.either),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect((result.left as any)._tag).toBe("DatabaseQueryError");
    }
  });
});
