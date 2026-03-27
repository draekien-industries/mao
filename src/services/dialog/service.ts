import { Effect, Layer, Option } from "effect";
import { dialog } from "electron";
import { annotations } from "../diagnostics";
import { DialogError } from "./errors";
import { DialogService } from "./service-definition";

export const makeDialogServiceLive = () =>
  Layer.succeed(DialogService, {
    openDirectory: () =>
      Effect.gen(function* () {
        yield* Effect.logInfo("[dialog] showOpenDialog starting");
        const result = yield* Effect.tryPromise({
          try: () =>
            dialog.showOpenDialog({
              properties: ["openDirectory"],
              title: "Select Project Directory",
            }),
          catch: (cause) =>
            new DialogError({
              message: String(cause),
              operation: "openDirectory",
            }),
        });
        yield* Effect.logInfo(
          `[dialog] showOpenDialog done: canceled=${result.canceled} paths=${JSON.stringify(result.filePaths)}`,
        );
        return result.canceled
          ? Option.none<string>()
          : Option.some(result.filePaths[0]);
      }).pipe(
        Effect.annotateLogs(annotations.operation, "openDirectory"),
        Effect.annotateLogs(annotations.service, "dialog"),
      ),
  });
