import { Effect, Layer, Option } from "effect";
import { DatabaseQueryError } from "../errors";
import { Database } from "../service-definition";
import type { Tab, TabCreate, TabUpdate } from "./schemas";
import { TabStore } from "./service-definition";

// Stub implementation - to be implemented in GREEN phase
export const makeTabStoreLive = () =>
  Layer.effect(
    TabStore,
    Effect.gen(function* () {
      const { sql } = yield* Database;

      const create = (_input: TabCreate) =>
        Effect.fail(
          new DatabaseQueryError({
            cause: "Not implemented",
            message: "Not implemented",
          }),
        ) as Effect.Effect<Tab, DatabaseQueryError>;

      const getById = (_id: number) =>
        Effect.succeed(
          Option.none<Tab>(),
        ) as Effect.Effect<Option.Option<Tab>, DatabaseQueryError>;

      const getAll = () =>
        Effect.succeed(
          [] as ReadonlyArray<Tab>,
        ) as Effect.Effect<ReadonlyArray<Tab>, DatabaseQueryError>;

      const update = (_id: number, _input: TabUpdate) =>
        Effect.fail(
          new DatabaseQueryError({
            cause: "Not implemented",
            message: "Not implemented",
          }),
        ) as Effect.Effect<void, DatabaseQueryError>;

      const deleteTab = (_id: number) =>
        Effect.fail(
          new DatabaseQueryError({
            cause: "Not implemented",
            message: "Not implemented",
          }),
        ) as Effect.Effect<void, DatabaseQueryError>;

      return {
        create,
        delete: deleteTab,
        getAll,
        getById,
        update,
      };
    }),
  );
