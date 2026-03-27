import { Effect, Layer, Option, Schema } from "effect";
import { annotations } from "../../diagnostics";
import { DatabaseQueryError } from "../errors";
import { Database } from "../service-definition";
import type { TabCreate, TabUpdate } from "./schemas";
import { Tab } from "./schemas";
import { TabStore } from "./service-definition";

interface TabRow {
  readonly created_at: string;
  readonly cwd: string;
  readonly display_label: string | null;
  readonly git_branch: string | null;
  readonly id: number;
  readonly project_id: number | null;
  readonly session_id: string | null;
  readonly updated_at: string;
}

const decodeTab = (row: TabRow) => Schema.decodeUnknown(Tab)(row);

export const makeTabStoreLive = () =>
  Layer.effect(
    TabStore,
    Effect.gen(function* () {
      const { sql } = yield* Database;

      const create = (input: TabCreate) =>
        Effect.gen(function* () {
          const rows = yield* sql<TabRow>`
            INSERT INTO tabs (session_id, cwd, git_branch, display_label, project_id)
            VALUES (
              ${input.session_id ?? null},
              ${input.cwd},
              ${input.git_branch ?? null},
              ${input.display_label ?? null},
              ${input.project_id ?? null}
            )
            RETURNING id, session_id, cwd, git_branch, display_label, project_id, created_at, updated_at
          `;
          yield* Effect.logInfo(
            `[tab-store] create raw row: ${JSON.stringify(rows[0])}`,
          );
          return yield* decodeTab(rows[0]);
        }).pipe(
          Effect.mapError(
            (cause) =>
              new DatabaseQueryError({
                cause: String(cause),
                message: "Failed to create tab",
              }),
          ),
          Effect.annotateLogs(annotations.operation, "create"),
        );

      const getById = (id: number) =>
        Effect.gen(function* () {
          const rows = yield* sql<TabRow>`
            SELECT id, session_id, cwd, git_branch, display_label, project_id, created_at, updated_at
            FROM tabs WHERE id = ${id}
          `;
          if (rows.length === 0) return Option.none<Tab>();
          const tab = yield* decodeTab(rows[0]);
          return Option.some(tab);
        }).pipe(
          Effect.mapError(
            (cause) =>
              new DatabaseQueryError({
                cause: String(cause),
                message: `Failed to get tab ${id}`,
              }),
          ),
          Effect.annotateLogs(annotations.operation, "getById"),
        );

      const getAll = () =>
        Effect.gen(function* () {
          const rows = yield* sql<TabRow>`
            SELECT id, session_id, cwd, git_branch, display_label, project_id, created_at, updated_at
            FROM tabs
          `;
          const tabs: Tab[] = [];
          for (const row of rows) {
            tabs.push(yield* decodeTab(row));
          }
          return tabs as ReadonlyArray<Tab>;
        }).pipe(
          Effect.mapError(
            (cause) =>
              new DatabaseQueryError({
                cause: String(cause),
                message: "Failed to get all tabs",
              }),
          ),
          Effect.annotateLogs(annotations.operation, "getAll"),
        );

      const update = (id: number, input: TabUpdate) =>
        Effect.gen(function* () {
          // Build SET clause dynamically from provided fields
          const updates: Record<string, unknown> = {};
          if (input.cwd !== undefined) updates.cwd = input.cwd;
          if (input.session_id !== undefined)
            updates.session_id = input.session_id;
          if (input.git_branch !== undefined)
            updates.git_branch = input.git_branch;
          if (input.display_label !== undefined)
            updates.display_label = input.display_label;
          if (input.project_id !== undefined)
            updates.project_id = input.project_id;
          updates.updated_at = new Date()
            .toISOString()
            .replace("T", " ")
            .slice(0, 19);

          yield* sql`UPDATE tabs SET ${sql.update(updates, ["id"])} WHERE id = ${id}`;
        }).pipe(
          Effect.asVoid,
          Effect.mapError(
            (cause) =>
              new DatabaseQueryError({
                cause: String(cause),
                message: `Failed to update tab ${id}`,
              }),
          ),
          Effect.annotateLogs(annotations.operation, "update"),
        );

      // D-04: Hard delete. D-05/D-09: Cascade to events within transaction.
      const deleteTab = (id: number) =>
        Effect.gen(function* () {
          // Look up session_id for cascade
          const rows = yield* sql<{ session_id: string | null }>`
            SELECT session_id FROM tabs WHERE id = ${id}
          `;
          const tab = rows[0];
          if (!tab) return; // tab already gone, no-op

          // D-05/D-09: Cascade purge events if tab had a session
          if (tab.session_id) {
            yield* sql`DELETE FROM events WHERE session_id = ${tab.session_id}`;
          }

          // D-04: Hard delete
          yield* sql`DELETE FROM tabs WHERE id = ${id}`;
        }).pipe(
          sql.withTransaction,
          Effect.asVoid,
          Effect.mapError(
            (cause) =>
              new DatabaseQueryError({
                cause: String(cause),
                message: `Failed to delete tab ${id}`,
              }),
          ),
          Effect.annotateLogs(annotations.operation, "delete"),
        );

      return {
        create,
        delete: deleteTab,
        getAll,
        getById,
        update,
      };
    }).pipe(Effect.annotateLogs(annotations.service, "tab-store")),
  );
