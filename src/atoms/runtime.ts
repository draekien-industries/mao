import { Atom } from "@effect-atom/atom-react";
import { Layer } from "effect";
import {
  ClaudeCliFromRpc,
  RendererRpcClientLayer,
} from "@/services/claude-rpc/client";

// ClaudeCliFromRpc depends on RendererRpcClient (shared single RPC client).
// provideMerge wires the dependency and exposes both tags to atoms.
const RendererLayer = ClaudeCliFromRpc.pipe(
  Layer.provideMerge(RendererRpcClientLayer),
);

export const appRuntime = Atom.runtime(RendererLayer);
