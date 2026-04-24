import { RpcServer } from "@effect/rpc";
import { Effect, Layer, Mailbox, Option, Runtime } from "effect";
import { ipcMain } from "electron";
import { ClaudeAgent } from "../claude-agent/service-definition";
import { annotations } from "../diagnostics";
import { DialogRpcGroup } from "../dialog-rpc/group";
import { GitRpcGroup } from "../git-rpc/group";
import { PersistenceRpcGroup } from "../persistence-rpc/group";
import { RPC_FROM_CLIENT, RPC_FROM_SERVER } from "./channels";
import { ClaudeRpcGroup } from "./group";

const MergedRpcGroup = ClaudeRpcGroup.merge(PersistenceRpcGroup)
  .merge(GitRpcGroup)
  .merge(DialogRpcGroup);

export const ClaudeRpcHandlers = ClaudeRpcGroup.toLayer(
  Effect.gen(function* () {
    const agent = yield* ClaudeAgent;
    return agent;
  }),
);

// Protocol.make factory: receives a `write` callback for forwarding
// decoded client messages to the RPC server. Returns everything except
// `run` — the factory assembles `run` automatically, buffering any
// messages that arrive before `run` is called by RpcServer.make.
const ElectronServerProtocol = Layer.scoped(
  RpcServer.Protocol,
  RpcServer.Protocol.make((write) =>
    Effect.gen(function* () {
      const clients = new Map<number, Electron.WebContents>();
      const disconnects = yield* Mailbox.make<number>();
      const rt = yield* Effect.runtime<never>();

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
                yield* disconnects.offer(clientId);
              }).pipe(Effect.annotateLogs(annotations.service, "rpc")),
            );
          });
        }
        Runtime.runFork(rt)(
          Effect.gen(function* () {
            yield* Effect.logDebug("Message received");
            yield* write(clientId, message);
          }).pipe(
            Effect.annotateLogs(annotations.clientId, clientId),
            Effect.annotateLogs(annotations.service, "rpc"),
          ),
        );
      });

      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* Effect.logInfo("RPC server shutting down");
          ipcMain.removeAllListeners(RPC_FROM_CLIENT);
        }),
      );

      return {
        disconnects,
        send: (clientId: number, response: unknown) =>
          Effect.gen(function* () {
            const webContents = clients.get(clientId);
            if (webContents && !webContents.isDestroyed()) {
              webContents.send(RPC_FROM_SERVER, response);
              yield* Effect.logDebug("Response sent").pipe(
                Effect.annotateLogs(annotations.clientId, clientId),
              );
            } else {
              yield* Effect.logWarning(
                "Response dropped — client destroyed",
              ).pipe(Effect.annotateLogs(annotations.clientId, clientId));
            }
          }),
        end: (clientId: number) =>
          Effect.sync(() => {
            clients.delete(clientId);
          }),
        clientIds: Effect.sync(() => new Set(clients.keys())),
        initialMessage: Effect.succeed(Option.none()),
        supportsAck: false,
        supportsTransferables: false,
        supportsSpanPropagation: false,
      };
    }),
  ),
);

export const startRpcServer = Effect.gen(function* () {
  yield* Effect.logInfo("RPC server starting");
  return yield* RpcServer.make(MergedRpcGroup);
}).pipe(
  Effect.provide(ElectronServerProtocol),
  Effect.annotateLogs(annotations.service, "rpc"),
  Effect.withSpan("rpc-server"),
);
