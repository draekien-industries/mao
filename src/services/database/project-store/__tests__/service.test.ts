import type { SqlClient as SqlClientNamespace } from "@effect/sql";
import { SqlClient } from "@effect/sql";
import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import { Database } from "../../service-definition";
import { makeProjectStoreLive } from "../service";
import { ProjectStore } from "../service-definition";

interface InMemoryProject {
  created_at: string;
  directory: string;
  id: number;
  is_git_repo: number;
  name: string;
  updated_at: string;
  worktree_base_path: string | null;
}

interface InMemoryTab {
  id: number;
  project_id: number | null;
  session_id: string | null;
}

interface InMemoryEvent {
  id: number;
  session_id: string;
}

const makeInMemoryDatabase = () => {
  let projects: InMemoryProject[] = [];
  let tabs: InMemoryTab[] = [];
  let events: InMemoryEvent[] = [];
  let nextProjectId = 1;
  let nextTabId = 1;
  let nextEventId = 1;

  const sqlHandler = (
    strings: TemplateStringsArray,
    ...params: ReadonlyArray<unknown>
  ) => {
    const fullSql = strings.join("?").replace(/\s+/g, " ").trim();

    // INSERT INTO projects
    if (fullSql.includes("INSERT INTO projects")) {
      const now = "2026-01-01 00:00:00";
      const project: InMemoryProject = {
        id: nextProjectId++,
        name: params[0] as string,
        directory: params[1] as string,
        is_git_repo: params[2] as number,
        worktree_base_path: params[3] as string | null,
        created_at: now,
        updated_at: now,
      };
      projects.push(project);
      return Effect.succeed([project]);
    }

    // SELECT ... FROM projects WHERE id = ?
    if (
      fullSql.includes("SELECT") &&
      fullSql.includes("FROM projects") &&
      fullSql.includes("WHERE id")
    ) {
      const id = params[0] as number;
      const found = projects.filter((p) => p.id === id);
      return Effect.succeed(found);
    }

    // SELECT ... FROM projects (getAll, no WHERE)
    if (
      fullSql.includes("SELECT") &&
      fullSql.includes("FROM projects") &&
      !fullSql.includes("WHERE")
    ) {
      return Effect.succeed([...projects]);
    }

    // SELECT id, session_id FROM tabs WHERE project_id = ?
    if (
      fullSql.includes("SELECT") &&
      fullSql.includes("FROM tabs") &&
      fullSql.includes("WHERE project_id")
    ) {
      const projectId = params[0] as number;
      const found = tabs.filter((t) => t.project_id === projectId);
      return Effect.succeed(found);
    }

    // DELETE FROM events WHERE session_id = ?
    if (fullSql.includes("DELETE FROM events")) {
      const sessionId = params[0] as string;
      events = events.filter((e) => e.session_id !== sessionId);
      return Effect.succeed([]);
    }

    // DELETE FROM tabs WHERE project_id = ?
    if (
      fullSql.includes("DELETE FROM tabs") &&
      fullSql.includes("project_id")
    ) {
      const projectId = params[0] as number;
      tabs = tabs.filter((t) => t.project_id !== projectId);
      return Effect.succeed([]);
    }

    // DELETE FROM projects WHERE id = ?
    if (fullSql.includes("DELETE FROM projects")) {
      const id = params[0] as number;
      projects = projects.filter((p) => p.id !== id);
      return Effect.succeed([]);
    }

    return Effect.succeed([]);
  };

  const mockSql = Object.assign(sqlHandler, {
    safe: undefined,
    reserve: Effect.succeed({}),
    unsafe: (rawSql: string) => Effect.succeed([]),
    update: (updates: Record<string, unknown>, omit: ReadonlyArray<string>) =>
      updates,
    withTransaction: <R, E, A>(self: Effect.Effect<A, E, R>) => self,
    withoutTransforms: () => mockSql,
  });

  return {
    getEvents: () => events,
    getProjects: () => projects,
    getTabs: () => tabs,
    insertEvent: (sessionId: string) => {
      events.push({ id: nextEventId++, session_id: sessionId });
    },
    insertTab: (projectId: number, sessionId: string | null) => {
      tabs.push({
        id: nextTabId++,
        project_id: projectId,
        session_id: sessionId,
      });
    },
    layer: Layer.succeed(
      SqlClient.SqlClient,
      mockSql as unknown as SqlClientNamespace.SqlClient,
    ),
    reset: () => {
      projects = [];
      tabs = [];
      events = [];
      nextProjectId = 1;
      nextTabId = 1;
      nextEventId = 1;
    },
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

  const testLayer = makeProjectStoreLive().pipe(
    Layer.provide(testDatabaseLayer.pipe(Layer.provide(db.layer))),
  );

  return { db, layer: testLayer };
};

const { db, layer: TestLayer } = makeTestLayer();

const runTest = <A, E>(effect: Effect.Effect<A, E, ProjectStore>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer), Effect.scoped));

describe("ProjectStore", () => {
  it("create inserts a project and returns it with generated id", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* ProjectStore;
        const project = yield* store.create({
          directory: "/home/user/project",
          is_git_repo: true,
          name: "my-project",
        });
        return project;
      }),
    );
    expect(result.id).toBeGreaterThanOrEqual(1);
    expect(result.name).toBe("my-project");
    expect(result.directory).toBe("/home/user/project");
    expect(result.is_git_repo).toBe(true);
    expect(result.worktree_base_path).toBeNull();
    expect(result.created_at).toBeDefined();
    expect(result.updated_at).toBeDefined();
  });

  it("create with optional worktree_base_path", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* ProjectStore;
        const project = yield* store.create({
          directory: "/home/user/project",
          is_git_repo: true,
          name: "my-project",
          worktree_base_path: "/home/user/.worktrees",
        });
        return project;
      }),
    );
    expect(result.worktree_base_path).toBe("/home/user/.worktrees");
  });

  it("getAll returns all projects", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* ProjectStore;
        yield* store.create({
          directory: "/project1",
          is_git_repo: true,
          name: "project-1",
        });
        yield* store.create({
          directory: "/project2",
          is_git_repo: false,
          name: "project-2",
        });
        return yield* store.getAll();
      }),
    );
    expect(result).toHaveLength(2);
  });

  it("getAll returns empty array when no projects", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* ProjectStore;
        return yield* store.getAll();
      }),
    );
    expect(result).toEqual([]);
  });

  it("getById returns Some for existing project", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* ProjectStore;
        const created = yield* store.create({
          directory: "/project",
          is_git_repo: false,
          name: "test-project",
        });
        return yield* store.getById(created.id);
      }),
    );
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.name).toBe("test-project");
    }
  });

  it("getById returns None for non-existent project", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* ProjectStore;
        return yield* store.getById(999);
      }),
    );
    expect(Option.isNone(result)).toBe(true);
  });

  it("remove deletes project and cascades to tabs and events", async () => {
    db.reset();
    // Set up: create a project, then manually add tabs and events
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* ProjectStore;
        const project = yield* store.create({
          directory: "/project",
          is_git_repo: true,
          name: "cascade-test",
        });

        // Insert tabs and events for cascade testing
        db.insertTab(project.id, "session-1");
        db.insertTab(project.id, "session-2");
        db.insertEvent("session-1");
        db.insertEvent("session-1");
        db.insertEvent("session-2");

        yield* store.remove(project.id);

        return {
          events: db.getEvents(),
          projects: db.getProjects(),
          tabs: db.getTabs(),
        };
      }),
    );
    expect(result.projects).toHaveLength(0);
    expect(result.tabs).toHaveLength(0);
    expect(result.events).toHaveLength(0);
  });

  it("remove does not affect other projects' data", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* ProjectStore;
        const p1 = yield* store.create({
          directory: "/project1",
          is_git_repo: true,
          name: "project-1",
        });
        yield* store.create({
          directory: "/project2",
          is_git_repo: false,
          name: "project-2",
        });

        db.insertTab(p1.id, "session-1");
        db.insertEvent("session-1");
        db.insertEvent("other-session");

        yield* store.remove(p1.id);

        return {
          events: db.getEvents(),
          projects: db.getProjects(),
        };
      }),
    );
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].name).toBe("project-2");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].session_id).toBe("other-session");
  });
});
