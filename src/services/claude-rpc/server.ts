import { RpcServer } from "@effect/rpc";
import { Effect, Runtime } from "effect";
import { ipcMain } from "electron";
import { ClaudeCli } from "../claude-cli/service-definition";
import { annotations } from "../diagnostics";
import { RPC_FROM_CLIENT, RPC_FROM_SERVER } from "./channels";
import { ClaudeRpcGroup } from "./group";

export const ClaudeRpcHandlers = ClaudeRpcGroup.toLayer(
  Effect.gen(function* () {
    const cli = yield* ClaudeCli;
    return cli;
  }),
);

export const startRpcServer = Effect.gen(function* () {
  const rt = yield* Effect.runtime<never>();
  const clients = new Map<number, Electron.WebContents>();

  yield* Effect.logInfo("RPC server starting");

  const server = yield* RpcServer.makeNoSerialization(ClaudeRpcGroup, {
    onFromServer: (response) =>
      Effect.gen(function* () {
        const webContents = clients.get(response.clientId);
        if (webContents && !webContents.isDestroyed()) {
          webContents.send(RPC_FROM_SERVER, response);
          yield* Effect.logDebug("Response sent").pipe(
            Effect.annotateLogs(annotations.clientId, response.clientId),
          );
        } else {
          yield* Effect.logWarning("Response dropped — client destroyed").pipe(
            Effect.annotateLogs(annotations.clientId, response.clientId),
          );
        }
      }),
  });

  yield* Effect.logInfo("RPC server listening");

  ipcMain.on(RPC_FROM_CLIENT, (event, message) => {
    const clientId = event.sender.id;
    if (!clients.has(clientId)) {
      clients.set(clientId, event.sender);
      Runtime.runFork(rt)(
        Effect.logInfo("Client connected").pipe(
          Effect.annotateLogs(annotations.clientId, clientId),
          Effect.annotateLogs(annotations.service, "rpc"),
        ),
      );
      event.sender.once("destroyed", () => {
        clients.delete(clientId);
        Runtime.runFork(rt)(
          Effect.gen(function* () {
            yield* Effect.logInfo("Client disconnected").pipe(
              Effect.annotateLogs(annotations.clientId, clientId),
            );
            yield* server.disconnect(clientId);
          }).pipe(Effect.annotateLogs(annotations.service, "rpc")),
        );
      });
    }
    Runtime.runFork(rt)(
      Effect.gen(function* () {
        yield* Effect.logDebug("Message received").pipe(
          Effect.annotateLogs(annotations.clientId, clientId),
        );
        yield* server.write(clientId, message);
      }).pipe(Effect.annotateLogs(annotations.service, "rpc")),
    );
  });

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      yield* Effect.logInfo("RPC server shutting down");
      ipcMain.removeAllListeners(RPC_FROM_CLIENT);
    }),
  );

  return yield* Effect.never;
}).pipe(
  Effect.annotateLogs(annotations.service, "rpc"),
  Effect.withSpan("rpc-server"),
);
