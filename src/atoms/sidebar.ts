import { Atom } from "@effect-atom/atom-react";
import { Effect } from "effect";
import { RendererRpcClient } from "@/services/claude-rpc/client";
import type { Project } from "@/services/database/project-store/schemas";
import type { Tab } from "@/services/database/tab-store/schemas";
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

// Eager-load projects and tabs from DB via RPC on app start
export const loadProjectsAtom = appRuntime.fn((_: void, ctx: Atom.FnContext) =>
  loadProjectsEffect(ctx),
);

// Switch to a different tab with skeleton loading transition
export const setActiveTabAtom = appRuntime.fn(
  (tabId: number, ctx: Atom.FnContext) =>
    Effect.sync(() => {
      ctx.set(sessionLoadingAtom, true);
      ctx.set(activeTabIdAtom, tabId);
      // Loading clears once the chat atom for this tab resolves
      ctx.set(sessionLoadingAtom, false);
    }),
);
