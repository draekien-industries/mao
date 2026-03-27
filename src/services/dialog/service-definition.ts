import type { Effect, Option } from "effect";
import { Context } from "effect";
import type { DialogError } from "./errors";

export class DialogService extends Context.Tag("DialogService")<
  DialogService,
  {
    readonly openDirectory: () => Effect.Effect<
      Option.Option<string>,
      DialogError
    >;
  }
>() {}
