import { Effect, Layer, Option, Schema } from "effect";
import { annotations } from "../../diagnostics";
import { DatabaseQueryError } from "../errors";
import { Database } from "../service-definition";
import type { ProjectCreate } from "./schemas";
import { Project } from "./schemas";
import { ProjectStore } from "./service-definition";

interface ProjectRow {
  readonly created_at: string;
  readonly directory: string;
  readonly id: number;
  readonly is_git_repo: number;
  readonly name: string;
  readonly updated_at: string;
  readonly worktree_base_path: string | null;
}

const decodeProject = (row: ProjectRow) => Schema.decodeUnknown(Project)(row);

export const makeProjectStoreLive = () =>
  Layer.effect(
    ProjectStore,
    Effect.gen(function* () {
      const { sql } = yield* Database;

      const create = (input: ProjectCreate) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(
            `[project-store] create called: name=${input.name} dir=${input.directory} git=${input.is_git_repo}`,
          );
          const rows = yield* sql<ProjectRow>`
            INSERT INTO projects (name, directory, is_git_repo, worktree_base_path)
            VALUES (
              ${input.name},
              ${input.directory},
              ${input.is_git_repo ? 1 : 0},
              ${input.worktree_base_path ?? null}
            )
            RETURNING id, name, directory, is_git_repo, worktree_base_path, created_at, updated_at
          `;
          yield* Effect.logInfo(
            `[project-store] insert returned ${rows.length} rows`,
          );
          const project = yield* decodeProject(rows[0]);
          yield* Effect.logInfo(
            `[project-store] decoded project id=${project.id}`,
          );
          return project;
        }).pipe(
          Effect.tapErrorCause((cause) =>
            Effect.logError(`[project-store] create FAILED: ${cause}`),
          ),
          Effect.mapError(
            (cause) =>
              new DatabaseQueryError({
                cause: String(cause),
                message: "Failed to create project",
              }),
          ),
          Effect.annotateLogs(annotations.operation, "create"),
        );

      const getAll = () =>
        Effect.gen(function* () {
          const rows = yield* sql<ProjectRow>`
            SELECT id, name, directory, is_git_repo, worktree_base_path, created_at, updated_at
            FROM projects
          `;
          const projects: Project[] = [];
          for (const row of rows) {
            projects.push(yield* decodeProject(row));
          }
          return projects as ReadonlyArray<Project>;
        }).pipe(
          Effect.mapError(
            (cause) =>
              new DatabaseQueryError({
                cause: String(cause),
                message: "Failed to get all projects",
              }),
          ),
          Effect.annotateLogs(annotations.operation, "getAll"),
        );

      const getById = (id: number) =>
        Effect.gen(function* () {
          const rows = yield* sql<ProjectRow>`
            SELECT id, name, directory, is_git_repo, worktree_base_path, created_at, updated_at
            FROM projects WHERE id = ${id}
          `;
          if (rows.length === 0) return Option.none<Project>();
          const project = yield* decodeProject(rows[0]);
          return Option.some(project);
        }).pipe(
          Effect.mapError(
            (cause) =>
              new DatabaseQueryError({
                cause: String(cause),
                message: `Failed to get project ${id}`,
              }),
          ),
          Effect.annotateLogs(annotations.operation, "getById"),
        );

      const remove = (id: number) =>
        Effect.gen(function* () {
          // Find all tabs belonging to this project
          const tabRows = yield* sql<{
            id: number;
            session_id: string | null;
          }>`
            SELECT id, session_id FROM tabs WHERE project_id = ${id}
          `;

          // Cascade: delete events for each tab's session
          for (const tab of tabRows) {
            if (tab.session_id) {
              yield* sql`DELETE FROM events WHERE session_id = ${tab.session_id}`;
            }
          }

          // Cascade: delete all tabs for this project
          yield* sql`DELETE FROM tabs WHERE project_id = ${id}`;

          // Delete the project itself
          yield* sql`DELETE FROM projects WHERE id = ${id}`;
        }).pipe(
          sql.withTransaction,
          Effect.asVoid,
          Effect.mapError(
            (cause) =>
              new DatabaseQueryError({
                cause: String(cause),
                message: `Failed to remove project ${id}`,
              }),
          ),
          Effect.annotateLogs(annotations.operation, "remove"),
        );

      return {
        create,
        getAll,
        getById,
        remove,
      };
    }).pipe(Effect.annotateLogs(annotations.service, "project-store")),
  );
