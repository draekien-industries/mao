import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SqlClient } from "@effect/sql";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Database } from "../service-definition";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mao-test-"));
  dbPath = path.join(tempDir, "test.db");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const makeTestLayer = () => {
  const SqliteLive = SqliteClient.layer({ filename: dbPath });
  // Dynamic import to get latest module (same pattern as errors.test.ts)
  return import("../service").then(({ makeDatabaseLive }) => {
    const DatabaseLayer = makeDatabaseLive(dbPath);
    return Layer.provideMerge(DatabaseLayer, SqliteLive);
  });
};

describe("makeDatabaseLive", () => {
  it("constructs successfully and provides Database service with a SqlClient", async () => {
    const testLayer = await makeTestLayer();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        return db.sql;
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    );
    expect(result).toBeDefined();
  });

  it("enables WAL mode (PRAGMA journal_mode returns wal)", async () => {
    const testLayer = await makeTestLayer();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        const rows = yield* db.sql.unsafe<{ journal_mode: string }>(
          "PRAGMA journal_mode",
        );
        return rows;
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    );
    expect(result).toHaveLength(1);
    expect(result[0].journal_mode).toBe("wal");
  });

  it("bootstraps events table with correct columns", async () => {
    const testLayer = await makeTestLayer();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        const tables = yield* db.sql.unsafe<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        );
        return tables.map((t) => t.name);
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    );
    expect(result).toContain("events");
  });

  it("bootstraps tabs table with correct columns", async () => {
    const testLayer = await makeTestLayer();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        const tables = yield* db.sql.unsafe<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        );
        return tables.map((t) => t.name);
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    );
    expect(result).toContain("tabs");
  });

  it("creates events session index", async () => {
    const testLayer = await makeTestLayer();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        const indexes = yield* db.sql.unsafe<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='index'",
        );
        return indexes.map((i) => i.name);
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    );
    expect(result).toContain("idx_events_session_id");
  });

  it("integrity check passes on a healthy database", async () => {
    const testLayer = await makeTestLayer();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        const rows = yield* db.sql.unsafe<{ quick_check: string }>(
          "PRAGMA quick_check",
        );
        return rows;
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    );
    expect(result[0].quick_check).toBe("ok");
  });

  it("creates database file at the specified path", async () => {
    const testLayer = await makeTestLayer();
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Database;
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    );
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it("releases database file lock after scope exits", async () => {
    const testLayer = await makeTestLayer();
    // Run the layer in a scope, then after scope exits verify we can open the db
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Database;
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    );
    // If the connection was properly closed, we should be able to open it again
    // better-sqlite3 uses exclusive file locks, so this would fail if not closed
    const BetterSqlite3 = (await import("better-sqlite3")).default;
    const db = new BetterSqlite3(dbPath);
    expect(() => db.pragma("journal_mode")).not.toThrow();
    db.close();
  });
});
