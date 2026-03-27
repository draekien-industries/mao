import { Atom } from "@effect-atom/atom";
import type { SessionStatus } from "@/components/session-status-indicator";

export interface MockSession {
  readonly branchLabel: string;
  readonly id: string;
  readonly status: SessionStatus;
}

export interface MockProject {
  readonly name: string;
  readonly sessions: ReadonlyArray<MockSession>;
}

// Atom tracking which tab is active (selected in sidebar)
export const activeTabIdAtom = Atom.make("tab-1").pipe(Atom.keepAlive);

// Hardcoded mock data per D-09 and UI-SPEC copywriting contract
export const mockProjects: ReadonlyArray<MockProject> = [
  {
    name: "mao",
    sessions: [{ id: "tab-1", branchLabel: "main", status: "idle" }],
  },
  {
    name: "example-project",
    sessions: [
      { id: "tab-2", branchLabel: "feature/auth", status: "idle" },
      { id: "tab-3", branchLabel: "develop", status: "idle" },
    ],
  },
];
