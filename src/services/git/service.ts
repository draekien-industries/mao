import path from "node:path";
import { Command, CommandExecutor } from "@effect/platform";
import { Effect, Layer, Stream } from "effect";
import { annotations } from "../diagnostics";
import { GitOperationError } from "./errors";
import { Worktree } from "./schemas";
import { GitService } from "./service-definition";

const parseWorktreePorcelain = (output: string): ReadonlyArray<Worktree> => {
  const blocks = output
    .split("\n\n")
    .filter((block) => block.trim().length > 0);

  return blocks.map((block) => {
    const lines = block.split("\n");
    let wtPath = "";
    let head = "";
    let branch: string | null = null;

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        wtPath = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
      }
      // "detached" line means branch stays null
    }

    return new Worktree({ branch, head, path: wtPath });
  });
};

export const makeGitServiceLive = () =>
  Layer.effect(
    GitService,
    Effect.gen(function* () {
      const executor = yield* CommandExecutor.CommandExecutor;
      yield* Effect.logInfo("GitService layer constructed");

      const runGitCommand = (
        args: ReadonlyArray<string>,
        cwd: string,
        operation: string,
      ) =>
        Effect.gen(function* () {
          let command = Command.make("git", ...args);
          command = Command.workingDirectory(command, cwd);

          const process = yield* executor.start(command).pipe(
            Effect.tapError((cause) =>
              Effect.logError("Git command failed").pipe(
                Effect.annotateLogs("error", String(cause)),
              ),
            ),
            Effect.mapError(
              (cause) =>
                new GitOperationError({
                  message: String(cause),
                  operation,
                }),
            ),
          );

          const stdout = yield* process.stdout.pipe(
            Stream.decodeText(),
            Stream.runFold("", (a, s) => a + s),
            Effect.mapError(
              (cause) =>
                new GitOperationError({
                  message: String(cause),
                  operation,
                }),
            ),
          );

          const exitCode = yield* process.exitCode.pipe(
            Effect.mapError(
              (cause) =>
                new GitOperationError({
                  message: String(cause),
                  operation,
                }),
            ),
          );

          if (exitCode !== 0) {
            const stderr = yield* process.stderr.pipe(
              Stream.decodeText(),
              Stream.runFold("", (a, s) => a + s),
              Effect.mapError(
                (cause) =>
                  new GitOperationError({
                    message: String(cause),
                    operation,
                  }),
              ),
            );
            return yield* new GitOperationError({
              message: stderr.trim() || `git exited with code ${exitCode}`,
              operation,
            });
          }

          return stdout.trim();
        }).pipe(
          Effect.scoped,
          Effect.annotateLogs(annotations.operation, operation),
        );

      const listBranches = (cwd: string) =>
        runGitCommand(
          ["branch", "--list", "--format=%(refname:short)"],
          cwd,
          "listBranches",
        ).pipe(
          Effect.map((output) =>
            output.split("\n").filter((line) => line.length > 0),
          ),
        );

      const getCurrentBranch = (cwd: string) =>
        runGitCommand(
          ["rev-parse", "--abbrev-ref", "HEAD"],
          cwd,
          "getCurrentBranch",
        );

      const getRepoName = (cwd: string) =>
        runGitCommand(
          ["rev-parse", "--show-toplevel"],
          cwd,
          "getRepoName",
        ).pipe(Effect.map((topLevel) => path.basename(topLevel)));

      const isGitRepo = (cwd: string) =>
        runGitCommand(
          ["rev-parse", "--is-inside-work-tree"],
          cwd,
          "isGitRepo",
        ).pipe(
          Effect.map((output) => output === "true"),
          Effect.catchAll(() => Effect.succeed(false)),
        );

      const listWorktrees = (cwd: string) =>
        runGitCommand(
          ["worktree", "list", "--porcelain"],
          cwd,
          "listWorktrees",
        ).pipe(Effect.map(parseWorktreePorcelain));

      const createWorktree = (
        cwd: string,
        branchName: string,
        basePath: string,
      ) =>
        Effect.gen(function* () {
          yield* Effect.logInfo("Creating worktree");
          const worktreePath = path.join(basePath, branchName);
          const branches = yield* listBranches(cwd);
          const branchExists = branches.includes(branchName);
          const args = branchExists
            ? ["worktree", "add", worktreePath, branchName]
            : ["worktree", "add", worktreePath, "-b", branchName];
          yield* runGitCommand(args, cwd, "createWorktree");
          return worktreePath;
        });

      const removeWorktree = (cwd: string, worktreePath: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo("Removing worktree");
          yield* runGitCommand(
            ["worktree", "remove", worktreePath],
            cwd,
            "removeWorktree",
          );
        }).pipe(Effect.asVoid);

      return {
        createWorktree,
        getCurrentBranch,
        getRepoName,
        isGitRepo,
        listBranches,
        listWorktrees,
        removeWorktree,
      };
    }).pipe(Effect.annotateLogs(annotations.service, "git")),
  );
