import { Atom } from "@effect-atom/atom-react";
import { Layer } from "effect";
import {
  ClaudeCliFromRpc,
  RendererRpcClientLayer,
} from "@/services/claude-rpc/client";

// Merge ClaudeCli and RendererRpcClient layers so all atoms
// can access both CLI streaming and typed RPC calls.
const RendererLayer = Layer.merge(ClaudeCliFromRpc, RendererRpcClientLayer);

export const appRuntime = Atom.runtime(RendererLayer);
