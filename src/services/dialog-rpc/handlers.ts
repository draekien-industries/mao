import { Effect, Option } from "effect";
import { DialogService } from "../dialog/service-definition";
import { DialogRpcGroup } from "./group";

export const DialogRpcHandlers = DialogRpcGroup.toLayer(
  Effect.gen(function* () {
    const dialogService = yield* DialogService;

    return {
      openDirectory: () =>
        dialogService.openDirectory().pipe(Effect.map(Option.getOrNull)),
    };
  }),
);
