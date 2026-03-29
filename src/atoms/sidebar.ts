import { Atom } from "@effect-atom/atom-react";
import { Effect } from "effect";
import { cwdAtom, messagesAtom, sessionIdAtom, unreadAtom } from "@/atoms/chat";
import { RendererRpcClient } from "@/services/claude-rpc/client";
import type { Project } from "@/services/database/project-store/schemas";
import type { Tab } from "@/services/database/tab-store/schemas";
import { annotations } from "@/services/diagnostics";
import { appRuntime } from "./runtime";

// --- Types ---

export interface ProjectWithSessions {
  readonly project: Project;
  readonly sessions: ReadonlyArray<Tab>;
}

// --- State atoms ---

// All projects with their associated sessions, loaded from DB
export const projectsAtom = Atom.make<ReadonlyArray<ProjectWithSessions>>(
  [],
).pipe(Atom.keepAlive);

// Currently active tab ID (SQLite integer), null when nothing is selected
export const activeTabIdAtom = Atom.make<number | null>(null).pipe(
  Atom.keepAlive,
);

// Whether a session switch is in progress (shows skeleton in chat panel)
export const sessionLoadingAtom = Atom.make(false).pipe(Atom.keepAlive);

// --- Shared effect for reloading projects from DB ---

const loadProjectsEffect = (ctx: Atom.FnContext) =>
  Effect.gen(function* () {
    const client = yield* RendererRpcClient;
    const projects = yield* client.listProjects({});
    const tabs = yield* client.listTabs({});
    const grouped: ReadonlyArray<ProjectWithSessions> = projects.map(
      (project) => ({
        project,
        sessions: tabs.filter((tab) => tab.project_id === project.id),
      }),
    );
    ctx.set(projectsAtom, grouped);
  });

// --- Action atoms ---

// Eager-load projects and tabs from DB via RPC on app start.
// If no tab is active, default to the first available tab.
export const loadProjectsAtom = appRuntime.fn((_: void, ctx: Atom.FnContext) =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Loading projects");
    yield* loadProjectsEffect(ctx);
    const activeId = ctx(activeTabIdAtom);
    if (activeId === null) {
      const projects = ctx(projectsAtom);
      const firstTab = projects[0]?.sessions[0];
      if (firstTab) {
        ctx.set(activeTabIdAtom, firstTab.id);
        ctx.set(cwdAtom(String(firstTab.id)), firstTab.cwd);

        // D-01: Hydrate active tab conversation on app start
        if (firstTab.session_id !== null) {
          ctx.set(sessionLoadingAtom, true);
          const client = yield* RendererRpcClient;
          yield* Effect.logDebug("Hydrating first tab session").pipe(
            Effect.annotateLogs(annotations.tabId, String(firstTab.id)),
            Effect.annotateLogs(annotations.sessionId, firstTab.session_id),
          );
          const session = yield* client.reconstructSession({
            sessionId: firstTab.session_id,
          });
          const tabKey = String(firstTab.id);
          // Pitfall 4: Set messages FIRST, then clear loading state
          ctx.set(
            messagesAtom(tabKey),
            session.messages.map((m) => ({
              content: m.content,
              role: m.role,
              ...(m.toolUseId !== undefined ? { toolUseId: m.toolUseId } : {}),
              ...(m.isError !== undefined ? { isError: m.isError } : {}),
            })),
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

// Switch to a different tab with lazy hydration (D-01)
export const setActiveTabAtom = appRuntime.fn(
  (tabId: number, ctx: Atom.FnContext) =>
    Effect.gen(function* () {
      ctx.set(sessionLoadingAtom, true);
      ctx.set(activeTabIdAtom, tabId);

      // Populate cwdAtom from projectsAtom for the activated tab
      const projects = ctx(projectsAtom);
      const tab = projects
        .flatMap((p) => p.sessions)
        .find((s) => s.id === tabId);
      if (tab) {
        ctx.set(cwdAtom(String(tabId)), tab.cwd);
      }

      // D-01: Lazy hydration -- only if tab has a session and messages not yet loaded
      const tabKey = String(tabId);
      const existingMessages = ctx(messagesAtom(tabKey));
      if (
        tab?.session_id !== null &&
        tab?.session_id !== undefined &&
        existingMessages.length === 0
      ) {
        const client = yield* RendererRpcClient;
        yield* Effect.logDebug("Lazy-hydrating tab session").pipe(
          Effect.annotateLogs(annotations.tabId, String(tabId)),
          Effect.annotateLogs(annotations.sessionId, tab.session_id),
        );
        const session = yield* client.reconstructSession({
          sessionId: tab.session_id,
        });
        // Pitfall 2: Always write to specific tabKey, never read activeTabIdAtom
        ctx.set(
          messagesAtom(tabKey),
          session.messages.map((m) => ({
            content: m.content,
            role: m.role,
            ...(m.toolUseId !== undefined ? { toolUseId: m.toolUseId } : {}),
            ...(m.isError !== undefined ? { isError: m.isError } : {}),
          })),
        );
        ctx.set(sessionIdAtom(tabKey), session.sessionId);
      }

      // Clear unread when switching to this tab
      ctx.set(unreadAtom(tabKey), false);

      // Pitfall 4: Set messages before clearing loading
      ctx.set(sessionLoadingAtom, false);
    }).pipe(
      Effect.tapError((cause) =>
        Effect.logError("Tab switch hydration failed").pipe(
          Effect.annotateLogs("error", String(cause)),
          Effect.annotateLogs(annotations.tabId, String(tabId)),
        ),
      ),
      Effect.catchAll(() =>
        Effect.sync(() => {
          ctx.set(sessionLoadingAtom, false);
        }),
      ),
      Effect.annotateLogs(annotations.service, "sidebar"),
      Effect.annotateLogs(annotations.operation, "setActiveTab"),
    ),
);

// Available branches for the branch autocomplete, populated by loadBranchesAtom
export const branchesAtom = Atom.make<ReadonlyArray<string>>([]).pipe(
  Atom.keepAlive,
);

// Fetch branches for a given cwd and populate branchesAtom
export const loadBranchesAtom = appRuntime.fn(
  (cwd: string, ctx: Atom.FnContext) =>
    Effect.gen(function* () {
      const client = yield* RendererRpcClient;
      const branches = yield* client.listBranches({ cwd });
      ctx.set(branchesAtom, branches);
    }),
);

// Register a project via native directory picker (D-16, D-17, D-09)
export const registerProjectAtom = appRuntime.fn(
  (_: void, ctx: Atom.FnContext) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Registering project");
      const client = yield* RendererRpcClient;

      // D-16: Open native directory picker
      const directory = yield* client.openDirectory({});
      if (directory === null) return;

      // D-16: Auto-derive name from git repo or folder name
      const isGit = yield* client
        .isGitRepo({ cwd: directory })
        .pipe(Effect.catchAll(() => Effect.succeed(false)));

      // Extract basename without node:path (not available in renderer)
      const basename = (p: string) => {
        const parts = p.replace(/\\/g, "/").split("/");
        return parts[parts.length - 1] || p;
      };

      let name: string;
      if (isGit) {
        name = yield* client
          .getRepoName({ cwd: directory })
          .pipe(Effect.catchAll(() => Effect.succeed(basename(directory))));
      } else {
        name = basename(directory);
      }

      // D-06: DB-first create
      const project = yield* client.createProject({
        name,
        directory,
        is_git_repo: isGit,
      });
      yield* Effect.logInfo("Project registered").pipe(
        Effect.annotateLogs("projectName", name),
      );

      // D-17: Auto-create first session on current branch
      let gitBranch: string | null = null;
      if (isGit) {
        gitBranch = yield* client
          .getCurrentBranch({ cwd: directory })
          .pipe(Effect.catchAll(() => Effect.succeed(null as string | null)));
      }

      const tab = yield* client.createTab({
        cwd: directory,
        project_id: project.id,
        git_branch: gitBranch ?? undefined,
        display_label: gitBranch ?? "default",
      });

      // Refresh atoms from DB
      yield* loadProjectsEffect(ctx);

      // D-09: Auto-expand project and activate first session
      ctx.set(activeTabIdAtom, tab.id);
      ctx.set(cwdAtom(String(tab.id)), directory);
    }).pipe(
      Effect.tapError((cause) =>
        Effect.logError("Project registration failed").pipe(
          Effect.annotateLogs("error", String(cause)),
        ),
      ),
      Effect.annotateLogs(annotations.service, "sidebar"),
      Effect.annotateLogs(annotations.operation, "registerProject"),
    ),
);

// Create a session within a project (D-10, D-11, D-12)
export const createSessionAtom = appRuntime.fn(
  (
    params: {
      readonly projectId: number;
      readonly cwd: string;
      readonly branchName: string;
      readonly useWorktree: boolean;
      readonly worktreeBasePath: string;
      readonly isGitRepo: boolean;
    },
    ctx: Atom.FnContext,
  ) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Creating session");
      const client = yield* RendererRpcClient;

      let sessionCwd = params.cwd;

      if (params.isGitRepo && params.useWorktree) {
        // D-12: Check if worktree already exists for this branch
        const existingWorktrees = yield* client.listWorktrees({
          cwd: params.cwd,
        });
        const existingWorktree = existingWorktrees.find(
          (wt) => wt.branch === params.branchName,
        );

        if (existingWorktree) {
          // Worktree exists -- reuse it (D-12)
          sessionCwd = existingWorktree.path;
        } else {
          // D-11: Create new worktree
          const worktreePath = yield* client.createWorktree({
            cwd: params.cwd,
            branchName: params.branchName,
            basePath: params.worktreeBasePath,
          });
          sessionCwd = worktreePath;
        }
      }

      // Create tab in DB
      const tab = yield* client.createTab({
        cwd: sessionCwd,
        project_id: params.projectId,
        git_branch: params.branchName,
        display_label: params.branchName,
      });
      yield* Effect.logInfo("Session created");

      // Refresh atoms
      yield* loadProjectsEffect(ctx);

      // Activate new session
      ctx.set(activeTabIdAtom, tab.id);
      ctx.set(cwdAtom(String(tab.id)), sessionCwd);
    }).pipe(
      Effect.tapError((cause) =>
        Effect.logError("Session creation failed").pipe(
          Effect.annotateLogs("error", String(cause)),
        ),
      ),
      Effect.annotateLogs(annotations.service, "sidebar"),
      Effect.annotateLogs(annotations.operation, "createSession"),
    ),
);

// Remove a project (D-20)
export const removeProjectAtom = appRuntime.fn(
  (projectId: number, ctx: Atom.FnContext) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Removing project").pipe(
        Effect.annotateLogs("projectId", String(projectId)),
      );
      const client = yield* RendererRpcClient;
      yield* client.removeProject({ id: projectId });

      // Refresh atoms
      yield* loadProjectsEffect(ctx);

      // If active tab was in removed project, clear it
      const projects = ctx(projectsAtom);
      const activeId = ctx(activeTabIdAtom);
      const stillExists = projects.some((p) =>
        p.sessions.some((s) => s.id === activeId),
      );
      if (!stillExists) {
        ctx.set(activeTabIdAtom, null);
      }
    }).pipe(
      Effect.tapError((cause) =>
        Effect.logError("Project removal failed").pipe(
          Effect.annotateLogs("error", String(cause)),
        ),
      ),
      Effect.annotateLogs(annotations.service, "sidebar"),
      Effect.annotateLogs(annotations.operation, "removeProject"),
    ),
);

// Check if a worktree already exists for a branch (D-12)
export const checkWorktreeExistsAtom = appRuntime.fn(
  (params: { readonly cwd: string; readonly branchName: string }) =>
    Effect.gen(function* () {
      const client = yield* RendererRpcClient;
      const worktrees = yield* client.listWorktrees({ cwd: params.cwd });
      const match = worktrees.find((wt) => wt.branch === params.branchName);
      return match
        ? { exists: true, path: match.path }
        : { exists: false, path: null };
    }),
);
