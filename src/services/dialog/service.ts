import { Effect, Layer, Option } from "effect";
import { dialog } from "electron";
import { annotations } from "../diagnostics";
import { DialogError } from "./errors";
import { DialogService } from "./service-definition";

export const makeDialogServiceLive = () =>
  Layer.succeed(DialogService, {
    openDirectory: () =>
      Effect.tryPromise({
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
      }).pipe(
        Effect.map((result) =>
          result.canceled
            ? Option.none<string>()
            : Option.some(result.filePaths[0]),
        ),
        Effect.tap((opt) =>
          Option.isSome(opt)
            ? Effect.logDebug("Directory selected")
            : Effect.logDebug("Directory selection cancelled"),
        ),
        Effect.annotateLogs(annotations.operation, "openDirectory"),
        Effect.annotateLogs(annotations.service, "dialog"),
      ),
  });
