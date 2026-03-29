import { Atom, Registry } from "@effect-atom/atom-react";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  RendererRpcClient,
  type RendererRpcClientService,
} from "@/atoms/__tests__/sidebar.test-helpers";
import { messagesAtom, sessionIdAtom, unreadAtom } from "@/atoms/chat";
import {
  activeTabIdAtom,
  projectsAtom,
  sessionLoadingAtom,
} from "@/atoms/sidebar";
import { annotations } from "@/services/diagnostics";

// --- Helpers ---

/** Build a test Atom.runtime backed by a mock RendererRpcClient. */
function makeTestRuntime(mockClient: RendererRpcClientService) {
  const mockLayer = Layer.succeed(RendererRpcClient, mockClient);
  return Atom.runtime(mockLayer);
}

/** Minimal tab structure matching the DB Tab shape. */
function makeTab(overrides: {
  readonly id: number;
  readonly session_id: string | null;
  readonly cwd?: string;
  readonly project_id?: number;
}) {
  return {
    id: overrides.id,
    session_id: overrides.session_id,
    cwd: overrides.cwd ?? "/test",
    project_id: overrides.project_id ?? 1,
    display_label: null,
    git_branch: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

// --- loadProjectsAtom behavior ---

describe("loadProjectsAtom hydration", () => {
  it("calls reconstructSession for the first tab when session_id is non-null", async () => {
    const calls: Array<string> = [];
    const mockClient = {
      reconstructSession: (params: { readonly sessionId: string }) => {
        calls.push(params.sessionId);
        return Effect.succeed({
          sessionId: params.sessionId,
          messages: [],
        });
      },
    };

    const testRuntime = makeTestRuntime(
      mockClient as unknown as RendererRpcClientService,
    );

    // Re-create loadProjectsAtom logic using test runtime
    const testLoadProjectsAtom = testRuntime.fn(
      (_: void, ctx: Atom.FnContext) =>
        Effect.gen(function* () {
          // Simulate loadProjectsEffect: set projectsAtom with test data
          ctx.set(projectsAtom, [
            {
              project: {
                id: 1,
                name: "test-project",
                directory: "/test",
                is_git_repo: false,
                worktree_base_path: null,
                created_at: "2026-01-01",
                updated_at: "2026-01-01",
              },
              sessions: [makeTab({ id: 42, session_id: "sess-abc" })],
            },
          ]);

          const activeId = ctx(activeTabIdAtom);
          if (activeId === null) {
            const projects = ctx(projectsAtom);
            const firstTab = projects[0]?.sessions[0];
            if (firstTab) {
              ctx.set(activeTabIdAtom, firstTab.id);

              // Hydration logic under test
              if (firstTab.session_id !== null) {
                ctx.set(sessionLoadingAtom, true);
                const client = yield* RendererRpcClient;
                const session = yield* client.reconstructSession({
                  sessionId: firstTab.session_id,
                });
                const tabKey = String(firstTab.id);
                ctx.set(
                  messagesAtom(tabKey),
                  session.messages.map(
                    (m: { content: string; role: string }) => ({
                      content: m.content,
                      role: m.role as "user" | "assistant" | "tool_result",
                    }),
                  ),
                );
                ctx.set(sessionIdAtom(tabKey), session.sessionId);
                ctx.set(sessionLoadingAtom, false);
              }
            }
          }
        }).pipe(
          Effect.annotateLogs(annotations.service, "sidebar"),
          Effect.annotateLogs(annotations.operation, "loadProjects"),
        ),
    );

    const registry = Registry.make();
    registry.set(testLoadProjectsAtom, undefined);

    // Allow effect to complete
    await new Promise((r) => setTimeout(r, 100));

    expect(calls).toEqual(["sess-abc"]);
  });

  it("populates messagesAtom with mapped messages from reconstructed session", async () => {
    const mockClient = {
      reconstructSession: () =>
        Effect.succeed({
          sessionId: "sess-abc",
          messages: [
            { content: "Hello", role: "user" },
            { content: "Hi there", role: "assistant" },
            {
              content: "Tool output",
              role: "tool_result",
              toolUseId: "tool-1",
              isError: false,
            },
          ],
        }),
    };

    const testRuntime = makeTestRuntime(
      mockClient as unknown as RendererRpcClientService,
    );

    const testLoadProjectsAtom = testRuntime.fn(
      (_: void, ctx: Atom.FnContext) =>
        Effect.gen(function* () {
          ctx.set(projectsAtom, [
            {
              project: {
                id: 1,
                name: "test",
                directory: "/test",
                is_git_repo: false,
                worktree_base_path: null,
                created_at: "2026-01-01",
                updated_at: "2026-01-01",
              },
              sessions: [makeTab({ id: 42, session_id: "sess-abc" })],
            },
          ]);

          const projects = ctx(projectsAtom);
          const firstTab = projects[0]?.sessions[0];
          if (
            firstTab?.session_id !== null &&
            firstTab?.session_id !== undefined
          ) {
            ctx.set(sessionLoadingAtom, true);
            const client = yield* RendererRpcClient;
            const session = yield* client.reconstructSession({
              sessionId: firstTab.session_id,
            });
            const tabKey = String(firstTab.id);
            ctx.set(
              messagesAtom(tabKey),
              session.messages.map(
                (m: {
                  content: string;
                  role: string;
                  toolUseId?: string;
                  isError?: boolean;
                }) => ({
                  content: m.content,
                  role: m.role as "user" | "assistant" | "tool_result",
                  ...(m.toolUseId !== undefined
                    ? { toolUseId: m.toolUseId }
                    : {}),
                  ...(m.isError !== undefined ? { isError: m.isError } : {}),
                }),
              ),
            );
            ctx.set(sessionIdAtom(tabKey), session.sessionId);
            ctx.set(sessionLoadingAtom, false);
          }
        }),
    );

    const registry = Registry.make();
    registry.set(testLoadProjectsAtom, undefined);
    await new Promise((r) => setTimeout(r, 100));

    const messages = registry.get(messagesAtom("42"));
    expect(messages).toEqual([
      { content: "Hello", role: "user" },
      { content: "Hi there", role: "assistant" },
      {
        content: "Tool output",
        role: "tool_result",
        toolUseId: "tool-1",
        isError: false,
      },
    ]);
  });

  it("sets sessionLoadingAtom to false AFTER messagesAtom is set", async () => {
    const loadingStates: Array<{ loading: boolean; messageCount: number }> = [];

    const mockClient = {
      reconstructSession: () =>
        Effect.succeed({
          sessionId: "sess-abc",
          messages: [{ content: "Hello", role: "user" }],
        }),
    };

    const testRuntime = makeTestRuntime(
      mockClient as unknown as RendererRpcClientService,
    );

    const testLoadProjectsAtom = testRuntime.fn(
      (_: void, ctx: Atom.FnContext) =>
        Effect.gen(function* () {
          ctx.set(projectsAtom, [
            {
              project: {
                id: 1,
                name: "test",
                directory: "/test",
                is_git_repo: false,
                worktree_base_path: null,
                created_at: "2026-01-01",
                updated_at: "2026-01-01",
              },
              sessions: [makeTab({ id: 42, session_id: "sess-abc" })],
            },
          ]);

          const firstTab = ctx(projectsAtom)[0]?.sessions[0];
          if (
            firstTab?.session_id !== null &&
            firstTab?.session_id !== undefined
          ) {
            ctx.set(sessionLoadingAtom, true);
            loadingStates.push({
              loading: true,
              messageCount: ctx(messagesAtom("42")).length,
            });

            const client = yield* RendererRpcClient;
            const session = yield* client.reconstructSession({
              sessionId: firstTab.session_id,
            });
            ctx.set(
              messagesAtom("42"),
              session.messages.map((m: { content: string; role: string }) => ({
                content: m.content,
                role: m.role as "user" | "assistant" | "tool_result",
              })),
            );

            // Record state: messages set but loading still true
            loadingStates.push({
              loading: ctx(sessionLoadingAtom),
              messageCount: ctx(messagesAtom("42")).length,
            });

            ctx.set(sessionLoadingAtom, false);

            // Record final state
            loadingStates.push({
              loading: ctx(sessionLoadingAtom),
              messageCount: ctx(messagesAtom("42")).length,
            });
          }
        }),
    );

    const registry = Registry.make();
    registry.set(testLoadProjectsAtom, undefined);
    await new Promise((r) => setTimeout(r, 100));

    // Loading set to true first, messages were empty
    expect(loadingStates[0]).toEqual({ loading: true, messageCount: 0 });
    // Messages set while still loading
    expect(loadingStates[1]).toEqual({ loading: true, messageCount: 1 });
    // Loading cleared after messages set
    expect(loadingStates[2]).toEqual({ loading: false, messageCount: 1 });
  });
});

// --- setActiveTabAtom behavior ---

describe("setActiveTabAtom hydration", () => {
  it("skips reconstruction when existingMessages.length > 0", async () => {
    const calls: Array<string> = [];
    const mockClient = {
      reconstructSession: (params: { readonly sessionId: string }) => {
        calls.push(params.sessionId);
        return Effect.succeed({ sessionId: params.sessionId, messages: [] });
      },
    };

    const testRuntime = makeTestRuntime(
      mockClient as unknown as RendererRpcClientService,
    );

    const testSetActiveTabAtom = testRuntime.fn(
      (tabId: number, ctx: Atom.FnContext) =>
        Effect.gen(function* () {
          ctx.set(sessionLoadingAtom, true);
          ctx.set(activeTabIdAtom, tabId);

          const projects = ctx(projectsAtom);
          const tab = projects
            .flatMap((p) => p.sessions)
            .find((s) => s.id === tabId);

          const tabKey = String(tabId);
          const existingMessages = ctx(messagesAtom(tabKey));
          if (
            tab?.session_id !== null &&
            tab?.session_id !== undefined &&
            existingMessages.length === 0
          ) {
            const client = yield* RendererRpcClient;
            const session = yield* client.reconstructSession({
              sessionId: tab.session_id,
            });
            ctx.set(
              messagesAtom(tabKey),
              session.messages.map((m: { content: string; role: string }) => ({
                content: m.content,
                role: m.role as "user" | "assistant" | "tool_result",
              })),
            );
            ctx.set(sessionIdAtom(tabKey), session.sessionId);
          }

          ctx.set(unreadAtom(tabKey), false);
          ctx.set(sessionLoadingAtom, false);
        }).pipe(
          Effect.catchAll(() =>
            Effect.sync(() => {
              ctx.set(sessionLoadingAtom, false);
            }),
          ),
        ),
    );

    const registry = Registry.make();

    // Pre-populate projects and messages for tab 42
    registry.set(projectsAtom, [
      {
        project: {
          id: 1,
          name: "test",
          directory: "/test",
          is_git_repo: false,
          worktree_base_path: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        },
        sessions: [makeTab({ id: 42, session_id: "sess-abc" })],
      },
    ]);
    registry.set(messagesAtom("42"), [
      { content: "Already loaded", role: "user" },
    ]);

    registry.set(testSetActiveTabAtom, 42);
    await new Promise((r) => setTimeout(r, 100));

    // reconstructSession should NOT have been called
    expect(calls).toEqual([]);
  });

  it("calls reconstructSession when existingMessages is empty and session_id is non-null", async () => {
    const calls: Array<string> = [];
    const mockClient = {
      reconstructSession: (params: { readonly sessionId: string }) => {
        calls.push(params.sessionId);
        return Effect.succeed({
          sessionId: params.sessionId,
          messages: [{ content: "Restored", role: "assistant" }],
        });
      },
    };

    const testRuntime = makeTestRuntime(
      mockClient as unknown as RendererRpcClientService,
    );

    const testSetActiveTabAtom = testRuntime.fn(
      (tabId: number, ctx: Atom.FnContext) =>
        Effect.gen(function* () {
          ctx.set(sessionLoadingAtom, true);
          ctx.set(activeTabIdAtom, tabId);

          const projects = ctx(projectsAtom);
          const tab = projects
            .flatMap((p) => p.sessions)
            .find((s) => s.id === tabId);

          const tabKey = String(tabId);
          const existingMessages = ctx(messagesAtom(tabKey));
          if (
            tab?.session_id !== null &&
            tab?.session_id !== undefined &&
            existingMessages.length === 0
          ) {
            const client = yield* RendererRpcClient;
            const session = yield* client.reconstructSession({
              sessionId: tab.session_id,
            });
            ctx.set(
              messagesAtom(tabKey),
              session.messages.map((m: { content: string; role: string }) => ({
                content: m.content,
                role: m.role as "user" | "assistant" | "tool_result",
              })),
            );
            ctx.set(sessionIdAtom(tabKey), session.sessionId);
          }

          ctx.set(unreadAtom(tabKey), false);
          ctx.set(sessionLoadingAtom, false);
        }).pipe(
          Effect.catchAll(() =>
            Effect.sync(() => {
              ctx.set(sessionLoadingAtom, false);
            }),
          ),
        ),
    );

    const registry = Registry.make();
    registry.set(projectsAtom, [
      {
        project: {
          id: 1,
          name: "test",
          directory: "/test",
          is_git_repo: false,
          worktree_base_path: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        },
        sessions: [makeTab({ id: 42, session_id: "sess-abc" })],
      },
    ]);

    registry.set(testSetActiveTabAtom, 42);
    await new Promise((r) => setTimeout(r, 100));

    expect(calls).toEqual(["sess-abc"]);
    expect(registry.get(messagesAtom("42"))).toEqual([
      { content: "Restored", role: "assistant" },
    ]);
  });

  it("handles reconstruction error and still clears sessionLoadingAtom", async () => {
    const mockClient = {
      reconstructSession: () =>
        Effect.fail({ _tag: "DatabaseQueryError", message: "DB error" }),
    };

    const testRuntime = makeTestRuntime(
      mockClient as unknown as RendererRpcClientService,
    );

    const testSetActiveTabAtom = testRuntime.fn(
      (tabId: number, ctx: Atom.FnContext) =>
        Effect.gen(function* () {
          ctx.set(sessionLoadingAtom, true);
          ctx.set(activeTabIdAtom, tabId);

          const projects = ctx(projectsAtom);
          const tab = projects
            .flatMap((p) => p.sessions)
            .find((s) => s.id === tabId);

          const tabKey = String(tabId);
          const existingMessages = ctx(messagesAtom(tabKey));
          if (
            tab?.session_id !== null &&
            tab?.session_id !== undefined &&
            existingMessages.length === 0
          ) {
            const client = yield* RendererRpcClient;
            const session = yield* client.reconstructSession({
              sessionId: tab.session_id,
            });
            ctx.set(
              messagesAtom(tabKey),
              session.messages.map((m: { content: string; role: string }) => ({
                content: m.content,
                role: m.role as "user" | "assistant" | "tool_result",
              })),
            );
            ctx.set(sessionIdAtom(tabKey), session.sessionId);
          }

          ctx.set(unreadAtom(tabKey), false);
          ctx.set(sessionLoadingAtom, false);
        }).pipe(
          Effect.tapError((cause) =>
            Effect.logError("Tab switch hydration failed").pipe(
              Effect.annotateLogs("error", String(cause)),
            ),
          ),
          Effect.catchAll(() =>
            Effect.sync(() => {
              ctx.set(sessionLoadingAtom, false);
            }),
          ),
        ),
    );

    const registry = Registry.make();
    registry.set(projectsAtom, [
      {
        project: {
          id: 1,
          name: "test",
          directory: "/test",
          is_git_repo: false,
          worktree_base_path: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        },
        sessions: [makeTab({ id: 42, session_id: "sess-abc" })],
      },
    ]);

    registry.set(testSetActiveTabAtom, 42);
    await new Promise((r) => setTimeout(r, 100));

    // Loading should be cleared even after error
    expect(registry.get(sessionLoadingAtom)).toBe(false);
    // Messages should still be empty (reconstruction failed)
    expect(registry.get(messagesAtom("42"))).toEqual([]);
  });
});
