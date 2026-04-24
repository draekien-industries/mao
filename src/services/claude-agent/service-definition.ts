import type { Stream } from "effect";
import { Context } from "effect";
import type { ClaudeAgentError } from "./errors";
import type { SDKMessage } from "./events";
import type { ContinueParams, QueryParams, ResumeParams } from "./params";

export class ClaudeAgent extends Context.Tag("ClaudeAgent")<
  ClaudeAgent,
  {
    readonly query: (
      params: QueryParams,
    ) => Stream.Stream<SDKMessage, ClaudeAgentError, never>;
    readonly resume: (
      params: ResumeParams,
    ) => Stream.Stream<SDKMessage, ClaudeAgentError, never>;
    readonly cont: (
      params: ContinueParams,
    ) => Stream.Stream<SDKMessage, ClaudeAgentError, never>;
  }
>() {}
