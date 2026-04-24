import { Layer, ManagedRuntime } from "effect";
import { ClaudeAgentFromRpc, RendererRpcClientLayer } from "./client";

// Kept for backward compatibility — main process may still reference this.
// Renderer-side code should use Atom.runtime via src/atoms/runtime.ts instead.
export const AppRuntime = ManagedRuntime.make(
  ClaudeAgentFromRpc.pipe(Layer.provide(RendererRpcClientLayer)),
);
