import { RpcServer } from "@effect/rpc";
import { Effect, Runtime } from "effect";
import { ipcMain } from "electron";
import { ClaudeCli } from "../claude-cli/service-definition";
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

  const server = yield* RpcServer.makeNoSerialization(ClaudeRpcGroup, {
    onFromServer: (response) =>
      Effect.sync(() => {
        const webContents = clients.get(response.clientId);
        if (webContents && !webContents.isDestroyed()) {
          webContents.send(RPC_FROM_SERVER, response);
        }
      }),
  });

  ipcMain.on(RPC_FROM_CLIENT, (event, message) => {
    const clientId = event.sender.id;
    if (!clients.has(clientId)) {
      clients.set(clientId, event.sender);
      event.sender.on("destroyed", () => {
        clients.delete(clientId);
        Runtime.runFork(rt)(server.disconnect(clientId));
      });
    }
    Runtime.runFork(rt)(server.write(clientId, message));
  });

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      ipcMain.removeAllListeners(RPC_FROM_CLIENT);
    }),
  );

  return yield* Effect.never;
});
