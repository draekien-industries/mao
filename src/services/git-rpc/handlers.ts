import { Effect } from "effect";
import { GitService } from "../git/service-definition";
import { GitRpcGroup } from "./group";

export const GitRpcHandlers = GitRpcGroup.toLayer(
  Effect.gen(function* () {
    const git = yield* GitService;

    return {
      createWorktree: ({ cwd, branchName, basePath }) =>
        git.createWorktree(cwd, branchName, basePath),
      getCurrentBranch: ({ cwd }) => git.getCurrentBranch(cwd),
      getRepoName: ({ cwd }) => git.getRepoName(cwd),
      isGitRepo: ({ cwd }) => git.isGitRepo(cwd),
      listBranches: ({ cwd }) => git.listBranches(cwd),
      listWorktrees: ({ cwd }) => git.listWorktrees(cwd),
      removeWorktree: ({ cwd, worktreePath }) =>
        git.removeWorktree(cwd, worktreePath),
    };
  }),
);
