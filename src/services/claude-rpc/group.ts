import { Rpc, RpcGroup } from "@effect/rpc";
import { ClaudeAgentErrorSchema } from "../claude-agent/errors";
import { SDKMessage } from "../claude-agent/events";
import {
  ContinueParams,
  QueryParams,
  ResumeParams,
} from "../claude-agent/params";

export class ClaudeRpcGroup extends RpcGroup.make(
  Rpc.make("query", {
    payload: QueryParams,
    success: SDKMessage,
    error: ClaudeAgentErrorSchema,
    stream: true,
  }),
  Rpc.make("resume", {
    payload: ResumeParams,
    success: SDKMessage,
    error: ClaudeAgentErrorSchema,
    stream: true,
  }),
  Rpc.make("cont", {
    payload: ContinueParams,
    success: SDKMessage,
    error: ClaudeAgentErrorSchema,
    stream: true,
  }),
) {}
