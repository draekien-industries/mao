import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { makeTabRuntimeManagerLive } from "../service";
import { TabRuntimeManager } from "../service-definition";

const runTest = <A, E>(
  effect: Effect.Effect<A, E, TabRuntimeManager>,
) =>
  Effect.runPromise(effect.pipe(Effect.provide(makeTabRuntimeManagerLive())));

describe("TabRuntimeManager", () => {
  it("getOrCreate returns a new runtime for a previously unseen tabId", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const manager = yield* TabRuntimeManager;
        const runtime = yield* manager.getOrCreate(1);
        return runtime;
      }),
    );

    expect(result.tabId).toBe(1);
    expect(typeof result.dispose).toBe("function");
  });

  it("getOrCreate returns the same runtime for a repeated tabId", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const manager = yield* TabRuntimeManager;
        const first = yield* manager.getOrCreate(42);
        const second = yield* manager.getOrCreate(42);
        return { first, second };
      }),
    );

    expect(result.first).toBe(result.second);
    expect(result.first.tabId).toBe(42);
  });

  it("dispose removes a specific tab runtime from the manager", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const manager = yield* TabRuntimeManager;
        const first = yield* manager.getOrCreate(10);
        yield* manager.dispose(10);
        const second = yield* manager.getOrCreate(10);
        return { first, second };
      }),
    );

    // After dispose, getOrCreate should return a new (different) runtime
    expect(result.first).not.toBe(result.second);
    expect(result.first.tabId).toBe(10);
    expect(result.second.tabId).toBe(10);
  });

  it("disposeAll disposes all tracked tab runtimes and clears the map", async () => {
    const result = await runTest(
      Effect.gen(function* () {
        const manager = yield* TabRuntimeManager;
        const r1 = yield* manager.getOrCreate(1);
        const r2 = yield* manager.getOrCreate(2);
        yield* manager.disposeAll();
        const r1After = yield* manager.getOrCreate(1);
        const r2After = yield* manager.getOrCreate(2);
        return { r1, r2, r1After, r2After };
      }),
    );

    // After disposeAll, getOrCreate should return new runtimes
    expect(result.r1).not.toBe(result.r1After);
    expect(result.r2).not.toBe(result.r2After);
  });
});
