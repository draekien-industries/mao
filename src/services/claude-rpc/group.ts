import { Rpc, RpcGroup } from "@effect/rpc";
import { ClaudeCliErrorSchema } from "../claude-cli/errors";
import { ClaudeEvent } from "../claude-cli/events";
import {
  ContinueParams,
  QueryParams,
  ResumeParams,
} from "../claude-cli/params";

export class ClaudeRpcGroup extends RpcGroup.make(
  Rpc.make("query", {
    payload: QueryParams,
    success: ClaudeEvent,
    error: ClaudeCliErrorSchema,
    stream: true,
  }),
  Rpc.make("resume", {
    payload: ResumeParams,
    success: ClaudeEvent,
    error: ClaudeCliErrorSchema,
    stream: true,
  }),
  Rpc.make("cont", {
    payload: ContinueParams,
    success: ClaudeEvent,
    error: ClaudeCliErrorSchema,
    stream: true,
  }),
) {}
