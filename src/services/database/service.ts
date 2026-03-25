import fs from "node:fs";
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

const integrityCheck = (
  sql: SqlClient.SqlClient,
  dbPath: string,
) =>
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

    // Dynamic require to avoid issues in test environments where electron is not available
    const electron = yield* Effect.try({
      try: () => require("electron") as typeof import("electron"),
      catch: () => new Error("electron not available"),
    }).pipe(Effect.orDie);

    const response = electron.dialog.showMessageBoxSync({
      type: "warning",
      title: "Database Corruption Detected",
      message: "The application database may be corrupted.",
      detail:
        "You can continue using the app (data may be unreliable) or reset the database (all history will be lost).",
      buttons: ["Continue Anyway", "Reset Database"],
      defaultId: 0,
      cancelId: 0,
    });

    if (response === 1) {
      yield* Effect.logInfo("User chose to reset database");
      for (const suffix of ["", "-wal", "-shm"]) {
        const file = dbPath + suffix;
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      }
      return yield* new DatabaseCorruptionError({
        message:
          "Database was corrupted and has been reset. Restart the app.",
      });
    }

    yield* Effect.logWarning(
      "User chose to continue with corrupted database",
    );
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

export const makeDatabaseLive = (dbPath: string) =>
  Layer.effect(
    Database,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* integrityCheck(sql, dbPath);
      yield* bootstrapSchema(sql);

      yield* Effect.logInfo("Database layer initialized");

      return { sql };
    }).pipe(Effect.annotateLogs(annotations.service, "database")),
  );
