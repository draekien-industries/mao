import { Cause, Effect, HashMap, Layer, ManagedRuntime, Ref } from "effect";
import { annotations } from "../diagnostics";
import type { TabRuntime } from "./service-definition";
import { TabRuntimeManager } from "./service-definition";

export const makeTabRuntimeManagerLive = () =>
  Layer.effect(
    TabRuntimeManager,
    Effect.gen(function* () {
      const runtimesRef = yield* Ref.make(HashMap.empty<number, TabRuntime>());

      yield* Effect.logInfo("TabRuntimeManager layer constructed");

      const getOrCreate = (tabId: number): Effect.Effect<TabRuntime> =>
        Effect.gen(function* () {
          yield* Effect.logDebug("getOrCreate called").pipe(
            Effect.annotateLogs(annotations.tabId, tabId),
          );

          const current = yield* Ref.get(runtimesRef);
          const existing = HashMap.get(current, tabId);

          if (existing._tag === "Some") {
            yield* Effect.logDebug("returning existing tab runtime").pipe(
              Effect.annotateLogs(annotations.tabId, tabId),
            );
            return existing.value;
          }

          // Scaffold: creates an empty ManagedRuntime for now.
          // Real per-tab ClaudeAgentLive wiring is future work.
          const managedRuntime = ManagedRuntime.make(Layer.empty);

          const tabRuntime: TabRuntime = {
            tabId,
            dispose: () => managedRuntime.dispose(),
          };

          yield* Ref.update(runtimesRef, HashMap.set(tabId, tabRuntime));

          yield* Effect.logInfo("created new tab runtime").pipe(
            Effect.annotateLogs(annotations.tabId, tabId),
          );

          return tabRuntime;
        }).pipe(Effect.annotateLogs(annotations.operation, "getOrCreate"));

      const dispose = (tabId: number): Effect.Effect<void> =>
        Effect.gen(function* () {
          yield* Effect.logDebug("dispose called").pipe(
            Effect.annotateLogs(annotations.tabId, tabId),
          );

          const current = yield* Ref.get(runtimesRef);
          const existing = HashMap.get(current, tabId);

          if (existing._tag === "Some") {
            yield* Effect.tryPromise({
              try: () => existing.value.dispose(),
              catch: (error) => new Cause.UnknownException(error),
            }).pipe(
              Effect.tapError((error) =>
                Effect.logError("tab runtime disposal failed").pipe(
                  Effect.annotateLogs(annotations.tabId, tabId),
                  Effect.annotateLogs("error", String(error)),
                ),
              ),
              Effect.catchAll(() => Effect.void),
            );

            yield* Ref.update(runtimesRef, HashMap.remove(tabId));

            yield* Effect.logInfo("disposed tab runtime").pipe(
              Effect.annotateLogs(annotations.tabId, tabId),
            );
          } else {
            yield* Effect.logDebug("no runtime found for tabId").pipe(
              Effect.annotateLogs(annotations.tabId, tabId),
            );
          }
        }).pipe(Effect.annotateLogs(annotations.operation, "dispose"));

      const disposeAll = (): Effect.Effect<void> =>
        Effect.gen(function* () {
          yield* Effect.logDebug("disposeAll called");

          const current = yield* Ref.get(runtimesRef);
          const entries = HashMap.toEntries(current);
          const count = entries.length;

          yield* Effect.forEach(entries, ([tabId, tabRuntime]) =>
            Effect.tryPromise({
              try: () => tabRuntime.dispose(),
              catch: (error) => new Cause.UnknownException(error),
            }).pipe(
              Effect.tapError((error) =>
                Effect.logError(
                  "tab runtime disposal failed during disposeAll",
                ).pipe(
                  Effect.annotateLogs(annotations.tabId, tabId),
                  Effect.annotateLogs("error", String(error)),
                ),
              ),
              Effect.catchAll(() => Effect.void),
            ),
          );

          yield* Ref.set(runtimesRef, HashMap.empty());

          yield* Effect.logInfo("disposed all tab runtimes").pipe(
            Effect.annotateLogs("count", count),
          );
        }).pipe(Effect.annotateLogs(annotations.operation, "disposeAll"));

      return {
        getOrCreate,
        dispose,
        disposeAll,
      };
    }).pipe(Effect.annotateLogs(annotations.service, "tab-runtime-manager")),
  );
