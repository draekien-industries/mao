import { RpcClient } from "@effect/rpc";
import { Effect, Layer, Runtime } from "effect";
import { ClaudeCli } from "../claude-cli/service-definition";
import { ClaudeRpcGroup } from "./group";

export const ClaudeCliFromRpc = Layer.scoped(
  ClaudeCli,
  Effect.gen(function* () {
    const rt = yield* Effect.runtime<never>();

    const { client, write } = yield* RpcClient.makeNoSerialization(
      ClaudeRpcGroup,
      {
        onFromClient: ({ message }) =>
          Effect.sync(() => window.electronAPI.rpc.send(message)),
        supportsAck: false,
      },
    );

    type ServerMessage = Parameters<typeof write>[0];
    const unsubscribe = window.electronAPI.rpc.onMessage<ServerMessage>(
      (message) => {
        Runtime.runFork(rt)(write(message));
      },
    );

    yield* Effect.addFinalizer(() => Effect.sync(() => unsubscribe()));

    return {
      query: (params) => client.query(params),
      resume: (params) => client.resume(params),
      cont: (params) => client.cont(params),
    };
  }),
);
