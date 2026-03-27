import type { Effect, Option } from "effect";
import { Context } from "effect";
import type { DatabaseQueryError } from "../errors";
import type { Project, ProjectCreate } from "./schemas";

export class ProjectStore extends Context.Tag("ProjectStore")<
  ProjectStore,
  {
    readonly create: (
      input: ProjectCreate,
    ) => Effect.Effect<Project, DatabaseQueryError>;
    readonly getAll: () => Effect.Effect<
      ReadonlyArray<Project>,
      DatabaseQueryError
    >;
    readonly getById: (
      id: number,
    ) => Effect.Effect<Option.Option<Project>, DatabaseQueryError>;
    readonly remove: (id: number) => Effect.Effect<void, DatabaseQueryError>;
  }
>() {}
