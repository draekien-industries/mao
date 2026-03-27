import { RpcClient } from "@effect/rpc";
import { RpcClientError } from "@effect/rpc/RpcClientError";
import type { FromServerEncoded } from "@effect/rpc/RpcMessage";
import { Context, Effect, Layer, Runtime, Stream } from "effect";
import type { ClaudeCliError } from "../claude-cli/errors";
import { ClaudeCliSpawnError } from "../claude-cli/errors";
import { ClaudeCli } from "../claude-cli/service-definition";
import { DialogRpcGroup } from "../dialog-rpc/group";
import { GitRpcGroup } from "../git-rpc/group";
import { PersistenceRpcGroup } from "../persistence-rpc/group";
import { ClaudeRpcGroup } from "./group";

const MergedRpcGroup = ClaudeRpcGroup.merge(PersistenceRpcGroup)
  .merge(GitRpcGroup)
  .merge(DialogRpcGroup);

const mapRpcError = (err: ClaudeCliError | RpcClientError): ClaudeCliError =>
  err._tag === "RpcClientError"
    ? new ClaudeCliSpawnError({
        message: `RPC transport error: ${err.message}`,
        cause: String(err.cause ?? "unknown"),
      })
    : err;

// Protocol.make factory: receives a `write` callback for forwarding
// decoded server messages to the RPC client. Returns everything except
// `run` — the factory assembles `run` automatically.
const ElectronClientProtocol = Layer.scoped(
  RpcClient.Protocol,
  RpcClient.Protocol.make((write) =>
    Effect.gen(function* () {
      const rt = yield* Effect.runtime<never>();

      // IPC transport boundary — Electron gives unknown, but RpcServer.make
      // encodes all messages as FromServerEncoded before sending via IPC.
      const unsubscribe = window.electronAPI.rpc.onMessage((message) => {
        Runtime.runFork(rt)(write(message as FromServerEncoded));
      });

      yield* Effect.addFinalizer(() => Effect.sync(() => unsubscribe()));

      return {
        send: (request: unknown) =>
          Effect.sync(() => window.electronAPI.rpc.send(request)),
        supportsAck: false,
        supportsTransferables: false,
      };
    }),
  ),
);

// Single shared RPC client — one protocol instance, one onMessage listener.
// Both ClaudeCli and RendererRpcClient derive from this same client.
const _makeClient = RpcClient.make(MergedRpcGroup);
type MergedRpcClient = Effect.Effect.Success<typeof _makeClient>;

export class RendererRpcClient extends Context.Tag("RendererRpcClient")<
  RendererRpcClient,
  MergedRpcClient
>() {}

const SharedClientLayer = Layer.scoped(RendererRpcClient, _makeClient).pipe(
  Layer.provide(ElectronClientProtocol),
);

export const ClaudeCliFromRpc = Layer.effect(
  ClaudeCli,
  Effect.gen(function* () {
    const client = yield* RendererRpcClient;
    return {
      query: (params) =>
        client.query(params).pipe(Stream.mapError(mapRpcError)),
      resume: (params) =>
        client.resume(params).pipe(Stream.mapError(mapRpcError)),
      cont: (params) => client.cont(params).pipe(Stream.mapError(mapRpcError)),
    };
  }),
);

export const RendererRpcClientLayer = SharedClientLayer;
