import type { Effect } from "effect";
import { Context } from "effect";
import type { GitOperationError } from "./errors";
import type { Worktree } from "./schemas";

export class GitService extends Context.Tag("GitService")<
  GitService,
  {
    readonly createWorktree: (
      cwd: string,
      branchName: string,
      basePath: string,
    ) => Effect.Effect<string, GitOperationError>;
    readonly getCurrentBranch: (
      cwd: string,
    ) => Effect.Effect<string, GitOperationError>;
    readonly getRepoName: (
      cwd: string,
    ) => Effect.Effect<string, GitOperationError>;
    readonly isGitRepo: (
      cwd: string,
    ) => Effect.Effect<boolean, GitOperationError>;
    readonly listBranches: (
      cwd: string,
    ) => Effect.Effect<ReadonlyArray<string>, GitOperationError>;
    readonly listWorktrees: (
      cwd: string,
    ) => Effect.Effect<ReadonlyArray<Worktree>, GitOperationError>;
    readonly removeWorktree: (
      cwd: string,
      worktreePath: string,
    ) => Effect.Effect<void, GitOperationError>;
  }
>() {}
