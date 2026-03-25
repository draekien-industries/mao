import { RpcClient } from "@effect/rpc";
import { RpcClientError } from "@effect/rpc/RpcClientError";
import type { FromServerEncoded } from "@effect/rpc/RpcMessage";
import { Effect, Layer, Runtime, Stream } from "effect";
import type { ClaudeCliError } from "../claude-cli/errors";
import { ClaudeCliSpawnError } from "../claude-cli/errors";
import { ClaudeCli } from "../claude-cli/service-definition";
import { ClaudeRpcGroup } from "./group";

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

      const unsubscribe = window.electronAPI.rpc.onMessage<FromServerEncoded>(
        (message) => {
          Runtime.runFork(rt)(write(message));
        },
      );

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

export const ClaudeCliFromRpc = Layer.scoped(
  ClaudeCli,
  Effect.gen(function* () {
    const client = yield* RpcClient.make(ClaudeRpcGroup);
    return {
      query: (params) =>
        client.query(params).pipe(Stream.mapError(mapRpcError)),
      resume: (params) =>
        client.resume(params).pipe(Stream.mapError(mapRpcError)),
      cont: (params) => client.cont(params).pipe(Stream.mapError(mapRpcError)),
    };
  }),
).pipe(Layer.provide(ElectronClientProtocol));
