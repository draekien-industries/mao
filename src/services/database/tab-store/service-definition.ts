import type { Effect, Option } from "effect";
import { Context } from "effect";
import type { DatabaseQueryError } from "../errors";
import type { Tab, TabCreate, TabUpdate } from "./schemas";

export class TabStore extends Context.Tag("TabStore")<
  TabStore,
  {
    readonly create: (
      input: TabCreate,
    ) => Effect.Effect<Tab, DatabaseQueryError>;
    readonly delete: (id: number) => Effect.Effect<void, DatabaseQueryError>;
    readonly getAll: () => Effect.Effect<
      ReadonlyArray<Tab>,
      DatabaseQueryError
    >;
    readonly getById: (
      id: number,
    ) => Effect.Effect<Option.Option<Tab>, DatabaseQueryError>;
    readonly update: (
      id: number,
      input: TabUpdate,
    ) => Effect.Effect<void, DatabaseQueryError>;
  }
>() {}
