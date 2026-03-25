import { SqlClient } from "@effect/sql";
import { Effect, Layer } from "effect";
import { annotations } from "../diagnostics";
import { DatabaseCorruptionError, DatabaseQueryError } from "./errors";
import {
  EVENTS_SESSION_INDEX_SQL,
  EVENTS_TABLE_SQL,
  TABS_TABLE_SQL,
} from "./schema";
import { Database } from "./service-definition";

const integrityCheck = (sql: SqlClient.SqlClient) =>
  Effect.gen(function* () {
    const result = yield* sql.unsafe<{ quick_check: string }>(
      "PRAGMA quick_check",
    );
    const isOk = result[0]?.quick_check === "ok";
    if (isOk) {
      yield* Effect.logInfo("Database integrity check passed");
      return;
    }

    yield* Effect.logWarning("Database integrity check failed");
    return yield* new DatabaseCorruptionError({
      message: "Database integrity check failed (PRAGMA quick_check)",
    });
  });

const bootstrapSchema = (sql: SqlClient.SqlClient) =>
  Effect.gen(function* () {
    yield* sql.unsafe(EVENTS_TABLE_SQL);
    yield* Effect.logDebug("Events table created");

    yield* sql.unsafe(EVENTS_SESSION_INDEX_SQL);
    yield* Effect.logDebug("Events session index created");

    yield* sql.unsafe(TABS_TABLE_SQL);
    yield* Effect.logDebug("Tabs table created");

    yield* Effect.logInfo("Database schema bootstrapped");
  }).pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseQueryError({
          cause: String(cause),
          message: "Failed to bootstrap database schema",
        }),
    ),
  );

export const makeDatabaseLive = () =>
  Layer.effect(
    Database,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* integrityCheck(sql);
      yield* bootstrapSchema(sql);

      yield* Effect.logInfo("Database layer initialized");

      return { sql };
    }).pipe(Effect.annotateLogs(annotations.service, "database")),
  );
