import { Atom } from "@effect-atom/atom-react";
import { Layer } from "effect";
import {
  ClaudeAgentFromRpc,
  RendererRpcClientLayer,
} from "@/services/claude-rpc/client";
import { DevLogger } from "@/services/diagnostics";

// ClaudeAgentFromRpc depends on RendererRpcClient (shared single RPC client).
// provideMerge wires the dependency and exposes both tags to atoms.
// DevLogger enables Effect.log* calls to produce pretty output in DevTools.
const RendererLayer = ClaudeAgentFromRpc.pipe(
  Layer.provideMerge(RendererRpcClientLayer),
  Layer.provide(DevLogger),
);

export const appRuntime = Atom.runtime(RendererLayer);
