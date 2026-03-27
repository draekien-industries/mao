import type { SqlClient as SqlClientNamespace } from "@effect/sql";
import { SqlClient } from "@effect/sql";
import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import { Database } from "../../service-definition";
import { makeTabStoreLive } from "../service";
import { TabStore } from "../service-definition";

// In-memory tab and event store for mocking the SQL layer
interface InMemoryTab {
  created_at: string;
  cwd: string;
  display_label: string | null;
  git_branch: string | null;
  id: number;
  project_id: number | null;
  session_id: string | null;
  updated_at: string;
}

interface InMemoryEvent {
  id: number;
  session_id: string;
}

const makeInMemoryDatabase = () => {
  let tabs: InMemoryTab[] = [];
  let events: InMemoryEvent[] = [];
  let nextTabId = 1;
  let nextEventId = 1;

  const sqlHandler = (
    strings: TemplateStringsArray,
    ...params: ReadonlyArray<unknown>
  ) => {
    const fullSql = strings.join("?").replace(/\s+/g, " ").trim();

    // INSERT INTO tabs
    if (fullSql.includes("INSERT INTO tabs")) {
      const now = new Date().toISOString();
      const tab: InMemoryTab = {
        id: nextTabId++,
        session_id: params[0] as string | null,
        cwd: params[1] as string,
        git_branch: params[2] as string | null,
        display_label: params[3] as string | null,
        project_id: params[4] as number | null,
        created_at: now,
        updated_at: now,
      };
      tabs.push(tab);
      return Effect.succeed([tab]);
    }

    // SELECT ... FROM tabs WHERE id = ?
    if (
      fullSql.includes("SELECT") &&
      fullSql.includes("FROM tabs") &&
      fullSql.includes("WHERE id")
    ) {
      const id = params[0] as number;
      const found = tabs.filter((t) => t.id === id);
      return Effect.succeed(found);
    }

    // SELECT ... FROM tabs (getAll, no WHERE)
    if (
      fullSql.includes("SELECT") &&
      fullSql.includes("FROM tabs") &&
      !fullSql.includes("WHERE")
    ) {
      return Effect.succeed([...tabs]);
    }

    // UPDATE tabs SET ... WHERE id = ?
    if (fullSql.includes("UPDATE tabs")) {
      // sql.update(updates, ["id"]) returns the updates object (from our mock)
      // which gets interpolated as the first param; the id is the last param
      const id = params[params.length - 1] as number;
      const tab = tabs.find((t) => t.id === id);
      if (tab) {
        // The first param is the updates object from sql.update mock
        const updates = params[0] as Record<string, unknown>;
        if (updates && typeof updates === "object") {
          if ("cwd" in updates) tab.cwd = updates.cwd as string;
          if ("session_id" in updates)
            tab.session_id = updates.session_id as string | null;
          if ("git_branch" in updates)
            tab.git_branch = updates.git_branch as string | null;
          if ("display_label" in updates)
            tab.display_label = updates.display_label as string | null;
          if ("project_id" in updates)
            tab.project_id = updates.project_id as number | null;
          if ("updated_at" in updates)
            tab.updated_at = updates.updated_at as string;
        }
      }
      return Effect.succeed([]);
    }

    // DELETE FROM events WHERE session_id = ?
    if (fullSql.includes("DELETE FROM events")) {
      const sessionId = params[0] as string;
      events = events.filter((e) => e.session_id !== sessionId);
      return Effect.succeed([]);
    }

    // DELETE FROM tabs WHERE id = ?
    if (fullSql.includes("DELETE FROM tabs")) {
      const id = params[0] as number;
      tabs = tabs.filter((t) => t.id !== id);
      return Effect.succeed([]);
    }

    // INSERT INTO events (for test setup)
    if (fullSql.includes("INSERT INTO events")) {
      events.push({
        id: nextEventId++,
        session_id: params[0] as string,
      });
      return Effect.succeed([]);
    }

    // SELECT ... FROM events (for test assertions)
    if (fullSql.includes("SELECT") && fullSql.includes("FROM events")) {
      if (fullSql.includes("WHERE session_id")) {
        const sessionId = params[0] as string;
        return Effect.succeed(events.filter((e) => e.session_id === sessionId));
      }
      return Effect.succeed([...events]);
    }

    return Effect.succeed([]);
  };

  // Update handler for sql.update() tagged template helper
  const updateHandler = (
    updates: Record<string, unknown>,
    omit: ReadonlyArray<string>,
  ) => {
    // sql.update returns a fragment that generates SET col1 = ?, col2 = ?
    // Since we're mocking, we return the updates object for the tagged template to use
    return updates;
  };

  const mockSql = Object.assign(sqlHandler, {
    safe: undefined,
    reserve: Effect.succeed({}),
    unsafe: (rawSql: string) => Effect.succeed([]),
    update: updateHandler,
    withTransaction: <R, E, A>(self: Effect.Effect<A, E, R>) => self,
    withoutTransforms: () => mockSql,
  });

  return {
    getEvents: () => events,
    getTabs: () => tabs,
    insertEvent: (sessionId: string) => {
      events.push({ id: nextEventId++, session_id: sessionId });
    },
    layer: Layer.succeed(
      SqlClient.SqlClient,
      mockSql as unknown as SqlClientNamespace.SqlClient,
    ),
    reset: () => {
      tabs = [];
      events = [];
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

  const testLayer = makeTabStoreLive().pipe(
    Layer.provide(testDatabaseLayer.pipe(Layer.provide(db.layer))),
  );

  return { db, layer: testLayer };
};

const { db, layer: TestLayer } = makeTestLayer();

const runTest = <A, E>(effect: Effect.Effect<A, E, TabStore>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer), Effect.scoped));

describe("TabStore", () => {
  it("create inserts a tab and returns it with generated id", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* TabStore;
        const tab = yield* store.create({ cwd: "/project" });
        return tab;
      }),
    );
    expect(result.id).toBeGreaterThanOrEqual(1);
    expect(result.cwd).toBe("/project");
    expect(result.session_id).toBeNull();
    expect(result.git_branch).toBeNull();
    expect(result.display_label).toBeNull();
    expect(result.created_at).toBeDefined();
    expect(result.updated_at).toBeDefined();
  });

  it("create with all optional fields", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* TabStore;
        const tab = yield* store.create({
          cwd: "/project",
          display_label: "My Tab",
          git_branch: "main",
          session_id: "s1",
        });
        return tab;
      }),
    );
    expect(result.cwd).toBe("/project");
    expect(result.session_id).toBe("s1");
    expect(result.git_branch).toBe("main");
    expect(result.display_label).toBe("My Tab");
  });

  it("getById returns Some for existing tab", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* TabStore;
        const created = yield* store.create({ cwd: "/project" });
        const found = yield* store.getById(created.id);
        return found;
      }),
    );
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.cwd).toBe("/project");
    }
  });

  it("getById returns None for non-existent tab", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* TabStore;
        const found = yield* store.getById(999);
        return found;
      }),
    );
    expect(Option.isNone(result)).toBe(true);
  });

  it("getAll returns all tabs", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* TabStore;
        yield* store.create({ cwd: "/project1" });
        yield* store.create({ cwd: "/project2" });
        const all = yield* store.getAll();
        return all;
      }),
    );
    expect(result).toHaveLength(2);
  });

  it("getAll returns empty array when no tabs", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* TabStore;
        const all = yield* store.getAll();
        return all;
      }),
    );
    expect(result).toEqual([]);
  });

  it("update changes specified fields", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* TabStore;
        const created = yield* store.create({ cwd: "/project" });
        yield* store.update(created.id, { git_branch: "feature" });
        const found = yield* store.getById(created.id);
        return found;
      }),
    );
    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.git_branch).toBe("feature");
    }
  });

  it("delete removes the tab (D-04)", async () => {
    db.reset();
    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* TabStore;
        const created = yield* store.create({ cwd: "/project" });
        yield* store.delete(created.id);
        const found = yield* store.getById(created.id);
        return found;
      }),
    );
    expect(Option.isNone(result)).toBe(true);
  });

  it("delete cascades to events when tab has session_id (D-05, D-09)", async () => {
    db.reset();
    // Insert events directly into the mock
    db.insertEvent("s1");
    db.insertEvent("s1");

    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* TabStore;
        yield* store.create({ cwd: "/project", session_id: "s1" });
        yield* store.delete(1);
        // Check events remaining
        return db.getEvents().filter((e) => e.session_id === "s1");
      }),
    );
    expect(result).toHaveLength(0);
  });

  it("delete does not affect events for other sessions", async () => {
    db.reset();
    db.insertEvent("s1");
    db.insertEvent("s2");

    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* TabStore;
        yield* store.create({ cwd: "/project", session_id: "s1" });
        yield* store.delete(1);
        return db.getEvents().filter((e) => e.session_id === "s2");
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("delete with null session_id does not touch events", async () => {
    db.reset();
    db.insertEvent("s1");

    const result = await runTest(
      Effect.gen(function* () {
        const store = yield* TabStore;
        yield* store.create({ cwd: "/project" }); // no session_id
        yield* store.delete(1);
        return db.getEvents();
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("delete is a no-op if tab id does not exist", async () => {
    db.reset();
    // Should not throw
    await runTest(
      Effect.gen(function* () {
        const store = yield* TabStore;
        yield* store.delete(999);
      }),
    );
  });
});
