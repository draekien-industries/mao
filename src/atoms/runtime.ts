import { Atom } from "@effect-atom/atom-react";
import { ClaudeCliFromRpc } from "@/services/claude-rpc/client";

// Single runtime atom providing ClaudeCli service to all atoms.
// Replaces ManagedRuntime.make(ClaudeCliFromRpc) + RuntimeProvider.
export const appRuntime = Atom.runtime(ClaudeCliFromRpc);
