import { Effect, Option } from "effect";
import { DialogService } from "../dialog/service-definition";
import { DialogRpcGroup } from "./group";

export const DialogRpcHandlers = DialogRpcGroup.toLayer(
  Effect.gen(function* () {
    const dialogService = yield* DialogService;

    return {
      openDirectory: () =>
        Effect.gen(function* () {
          yield* Effect.logInfo("[dialog-rpc] openDirectory called");
          const result = yield* dialogService.openDirectory();
          const value = Option.getOrNull(result);
          yield* Effect.logInfo(`[dialog-rpc] openDirectory result=${value}`);
          return value;
        }),
    };
  }),
);
