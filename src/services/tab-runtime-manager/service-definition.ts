import { Context, Effect } from "effect";

export interface TabRuntime {
  readonly dispose: () => Promise<void>;
  readonly tabId: number;
}

export class TabRuntimeManager extends Context.Tag("TabRuntimeManager")<
  TabRuntimeManager,
  {
    readonly getOrCreate: (tabId: number) => Effect.Effect<TabRuntime>;
    readonly dispose: (tabId: number) => Effect.Effect<void>;
    readonly disposeAll: () => Effect.Effect<void>;
  }
>() {}
