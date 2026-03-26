import { Effect, Layer, Schema } from "effect";
import { annotations } from "../../diagnostics";
import { DatabaseQueryError } from "../errors";
import { Database } from "../service-definition";
import { StoredEvent } from "./schemas";
import { EventStore } from "./service-definition";

interface EventRow {
  readonly created_at: string;
  readonly event_data: string;
  readonly event_type: string;
  readonly id: number;
  readonly sequence_number: number;
  readonly session_id: string;
}

export const makeEventStoreLive = () =>
  Layer.effect(
    EventStore,
    Effect.gen(function* () {
      const { sql } = yield* Database;

      const append = (
        sessionId: string,
        eventType: string,
        eventData: string,
      ) =>
        sql`
          INSERT INTO events (session_id, sequence_number, event_type, event_data)
          VALUES (
            ${sessionId},
            (SELECT COALESCE(MAX(sequence_number), 0) + 1
             FROM events WHERE session_id = ${sessionId}),
            ${eventType},
            ${eventData}
          )
        `.pipe(
          Effect.asVoid,
          Effect.mapError(
            (cause) =>
              new DatabaseQueryError({
                cause: String(cause),
                message: `Failed to append event for session ${sessionId}`,
              }),
          ),
          Effect.annotateLogs(annotations.operation, "append"),
        );

      const decodeStoredEvent = Schema.decodeUnknown(
        Schema.parseJson(StoredEvent),
      );

      const getBySession = (sessionId: string) =>
        Effect.gen(function* () {
          const rows = yield* sql<EventRow>`
            SELECT id, session_id, sequence_number, event_type, event_data, created_at
            FROM events
            WHERE session_id = ${sessionId}
            ORDER BY sequence_number ASC
          `;

          return yield* Effect.forEach(rows, (row) =>
            decodeStoredEvent(row.event_data).pipe(
              Effect.mapError(
                (cause) =>
                  new DatabaseQueryError({
                    cause: String(cause),
                    message: `Failed to decode event ${row.id} for session ${sessionId}`,
                  }),
              ),
            ),
          );
        }).pipe(
          Effect.mapError((cause) =>
            cause instanceof DatabaseQueryError
              ? cause
              : new DatabaseQueryError({
                  cause: String(cause),
                  message: `Failed to query events for session ${sessionId}`,
                }),
          ),
          Effect.annotateLogs(annotations.operation, "getBySession"),
        );

      const purgeSession = (sessionId: string) =>
        sql`DELETE FROM events WHERE session_id = ${sessionId}`.pipe(
          Effect.asVoid,
          Effect.mapError(
            (cause) =>
              new DatabaseQueryError({
                cause: String(cause),
                message: `Failed to purge events for session ${sessionId}`,
              }),
          ),
          Effect.annotateLogs(annotations.operation, "purgeSession"),
        );

      return { append, getBySession, purgeSession };
    }).pipe(Effect.annotateLogs(annotations.service, "event-store")),
  );
