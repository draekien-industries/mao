import { Layer, ManagedRuntime } from "effect";
import { ClaudeCliFromRpc, RendererRpcClientLayer } from "./client";

// Kept for backward compatibility — main process may still reference this.
// Renderer-side code should use Atom.runtime via src/atoms/runtime.ts instead.
export const AppRuntime = ManagedRuntime.make(
  ClaudeCliFromRpc.pipe(Layer.provide(RendererRpcClientLayer)),
);
