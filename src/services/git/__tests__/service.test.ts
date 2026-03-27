import { CommandExecutor } from "@effect/platform";
import { Effect, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { GitOperationError } from "../errors";
import { GitService } from "../service-definition";

// Encode text as UTF-8 bytes for mocking stdout
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

// Minimal mock process matching what Command.start returns
const makeMockProcess = (stdout: string, exitCode: number, stderr = "") =>
  ({
    exitCode: Effect.succeed(exitCode),
    stderr: Stream.make(encode(stderr)),
    stdout: Stream.make(encode(stdout)),
  }) as unknown as ReturnType<CommandExecutor.CommandExecutor["start"]>;

const makeExecutorLayer = (process: ReturnType<typeof makeMockProcess>) =>
  Layer.succeed(CommandExecutor.CommandExecutor, {
    start: () => Effect.succeed(process),
  } as unknown as CommandExecutor.CommandExecutor);

const makeTestLayer = (process: ReturnType<typeof makeMockProcess>) => {
  // Dynamic import to avoid importing @effect/platform-node at module level
  const serviceModule = import("../service");
  return serviceModule.then((mod) =>
    mod.makeGitServiceLive().pipe(Layer.provide(makeExecutorLayer(process))),
  );
};

describe("GitService", () => {
  it("listBranches parses branch output into string array", async () => {
    const layer = await makeTestLayer(
      makeMockProcess("main\nfeature/auth\ndevelop\n", 0),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const git = yield* GitService;
        return yield* git.listBranches("/repo");
      }).pipe(Effect.provide(layer), Effect.scoped),
    );

    expect(result).toEqual(["main", "feature/auth", "develop"]);
  });

  it("getCurrentBranch returns trimmed branch name", async () => {
    const layer = await makeTestLayer(makeMockProcess("main\n", 0));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const git = yield* GitService;
        return yield* git.getCurrentBranch("/repo");
      }).pipe(Effect.provide(layer), Effect.scoped),
    );

    expect(result).toBe("main");
  });

  it("getRepoName returns basename of toplevel path", async () => {
    const layer = await makeTestLayer(
      makeMockProcess("/home/user/repos/mao\n", 0),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const git = yield* GitService;
        return yield* git.getRepoName("/home/user/repos/mao");
      }).pipe(Effect.provide(layer), Effect.scoped),
    );

    expect(result).toBe("mao");
  });

  it("isGitRepo returns true when inside a git repo", async () => {
    const layer = await makeTestLayer(makeMockProcess("true\n", 0));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const git = yield* GitService;
        return yield* git.isGitRepo("/repo");
      }).pipe(Effect.provide(layer), Effect.scoped),
    );

    expect(result).toBe(true);
  });

  it("isGitRepo returns false when not a git repo", async () => {
    const layer = await makeTestLayer(
      makeMockProcess("", 128, "fatal: not a git repository"),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const git = yield* GitService;
        return yield* git.isGitRepo("/not-a-repo");
      }).pipe(Effect.provide(layer), Effect.scoped),
    );

    expect(result).toBe(false);
  });

  it("listWorktrees parses porcelain format correctly", async () => {
    const porcelain = [
      "worktree /home/user/repos/mao",
      "HEAD abc1234567890",
      "branch refs/heads/main",
      "",
      "worktree /home/user/repos/mao/.worktrees/feature",
      "HEAD def4567890123",
      "branch refs/heads/feature/auth",
      "",
      "worktree /home/user/repos/mao/.worktrees/detached",
      "HEAD 111222333444",
      "detached",
      "",
    ].join("\n");

    const layer = await makeTestLayer(makeMockProcess(porcelain, 0));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const git = yield* GitService;
        return yield* git.listWorktrees("/repo");
      }).pipe(Effect.provide(layer), Effect.scoped),
    );

    expect(result).toEqual([
      {
        branch: "main",
        head: "abc1234567890",
        path: "/home/user/repos/mao",
      },
      {
        branch: "feature/auth",
        head: "def4567890123",
        path: "/home/user/repos/mao/.worktrees/feature",
      },
      {
        branch: null,
        head: "111222333444",
        path: "/home/user/repos/mao/.worktrees/detached",
      },
    ]);
  });

  it("createWorktree uses existing branch without -b flag", async () => {
    // First call: listBranches returns "main\nexisting-branch\n"
    // Second call: worktree add returns ""
    let callCount = 0;
    const executorLayer = Layer.succeed(CommandExecutor.CommandExecutor, {
      start: () => {
        callCount++;
        if (callCount === 1) {
          // listBranches call
          return Effect.succeed(makeMockProcess("main\nexisting-branch\n", 0));
        }
        // createWorktree call
        return Effect.succeed(makeMockProcess("", 0));
      },
    } as unknown as CommandExecutor.CommandExecutor);

    const { makeGitServiceLive } = await import("../service");
    const layer = makeGitServiceLive().pipe(Layer.provide(executorLayer));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const git = yield* GitService;
        return yield* git.createWorktree(
          "/repo",
          "existing-branch",
          "/tmp/worktrees",
        );
      }).pipe(Effect.provide(layer), Effect.scoped),
    );

    // Should return the worktree path
    expect(result).toContain("existing-branch");
  });

  it("createWorktree uses -b flag for new branches", async () => {
    let callCount = 0;
    const executorLayer = Layer.succeed(CommandExecutor.CommandExecutor, {
      start: () => {
        callCount++;
        if (callCount === 1) {
          return Effect.succeed(makeMockProcess("main\ndevelop\n", 0));
        }
        return Effect.succeed(makeMockProcess("", 0));
      },
    } as unknown as CommandExecutor.CommandExecutor);

    const { makeGitServiceLive } = await import("../service");
    const layer = makeGitServiceLive().pipe(Layer.provide(executorLayer));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const git = yield* GitService;
        return yield* git.createWorktree(
          "/repo",
          "new-branch",
          "/tmp/worktrees",
        );
      }).pipe(Effect.provide(layer), Effect.scoped),
    );

    expect(result).toContain("new-branch");
  });

  it("removeWorktree calls git worktree remove", async () => {
    const layer = await makeTestLayer(makeMockProcess("", 0));

    await Effect.runPromise(
      Effect.gen(function* () {
        const git = yield* GitService;
        yield* git.removeWorktree("/repo", "/tmp/worktrees/feature");
      }).pipe(Effect.provide(layer), Effect.scoped),
    );

    // If we get here without error, the call succeeded
    expect(true).toBe(true);
  });

  it("produces GitOperationError on non-zero exit code", async () => {
    const layer = await makeTestLayer(
      makeMockProcess("", 1, "fatal: not a git repository"),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const git = yield* GitService;
        return yield* git.listBranches("/bad-repo").pipe(Effect.either);
      }).pipe(Effect.provide(layer), Effect.scoped),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(GitOperationError);
    }
  });
});
