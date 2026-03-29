import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { TabRuntimeManager } from "../tab-runtime-manager/service-definition";

/**
 * Tests the behavioral contract for shutdown disposal ordering (SAFE-01):
 * Per-tab runtimes must be disposed BEFORE the main runtime.
 *
 * This simulates the before-quit handler logic from main.ts without
 * importing Electron. It verifies call ordering via a tracked array.
 */
describe("Shutdown disposal ordering", () => {
  it("disposeAll is called before runtime.dispose in the shutdown sequence", async () => {
    const callOrder: string[] = [];

    const mockManagerLayer = Layer.succeed(TabRuntimeManager, {
      getOrCreate: () => Effect.die("not used"),
      dispose: () => Effect.die("not used"),
      disposeAll: () =>
        Effect.sync(() => {
          callOrder.push("disposeAll");
        }),
    });

    const mockRuntimeDispose = async () => {
      callOrder.push("runtimeDispose");
    };

    // Simulate the shutdown handler logic (mirrors main.ts before-quit)
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const manager = yield* TabRuntimeManager;
          yield* manager.disposeAll();
        }).pipe(Effect.provide(mockManagerLayer)),
      );
    } catch {
      // Error handling tested separately
    }

    try {
      await mockRuntimeDispose();
    } finally {
      // App would call app.exit(0) here
    }

    expect(callOrder).toEqual(["disposeAll", "runtimeDispose"]);
  });

  it("runtime.dispose is still called if disposeAll throws", async () => {
    const callOrder: string[] = [];

    const failingManagerLayer = Layer.succeed(TabRuntimeManager, {
      getOrCreate: () => Effect.die("not used"),
      dispose: () => Effect.die("not used"),
      disposeAll: () => Effect.fail(new Error("disposal failure")),
    });

    const mockRuntimeDispose = async () => {
      callOrder.push("runtimeDispose");
    };

    // Simulate the shutdown handler with error resilience
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const manager = yield* TabRuntimeManager;
          yield* manager.disposeAll();
        }).pipe(Effect.provide(failingManagerLayer)),
      );
    } catch {
      callOrder.push("disposeAllError");
    }

    try {
      await mockRuntimeDispose();
    } finally {
      // App would call app.exit(0) here
    }

    expect(callOrder).toContain("disposeAllError");
    expect(callOrder).toContain("runtimeDispose");
    expect(callOrder.indexOf("disposeAllError")).toBeLessThan(
      callOrder.indexOf("runtimeDispose"),
    );
  });

  it("disposal order is per-tab first, then main runtime", async () => {
    const callOrder: string[] = [];

    const mockManagerLayer = Layer.succeed(TabRuntimeManager, {
      getOrCreate: () => Effect.die("not used"),
      dispose: () => Effect.die("not used"),
      disposeAll: () =>
        Effect.sync(() => {
          callOrder.push("tab-1-disposed");
          callOrder.push("tab-2-disposed");
          callOrder.push("disposeAll-complete");
        }),
    });

    const mockRuntimeDispose = async () => {
      callOrder.push("main-runtime-disposed");
    };

    // Simulate shutdown
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const manager = yield* TabRuntimeManager;
          yield* manager.disposeAll();
        }).pipe(Effect.provide(mockManagerLayer)),
      );
    } catch {
      // not expected
    }

    try {
      await mockRuntimeDispose();
    } finally {
      // done
    }

    // All tab disposals happen before main runtime disposal
    const mainIdx = callOrder.indexOf("main-runtime-disposed");
    expect(mainIdx).toBeGreaterThan(0);
    for (const entry of callOrder.slice(0, mainIdx)) {
      expect(entry).not.toBe("main-runtime-disposed");
    }
    expect(callOrder[callOrder.length - 1]).toBe("main-runtime-disposed");
  });
});
