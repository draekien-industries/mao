import { Context } from "effect"
import type { Stream } from "effect"
import type { ClaudeCliError } from "./errors"
import type { ClaudeEvent } from "./events"
import type { ContinueParams, QueryParams, ResumeParams } from "./params"

export class ClaudeCli extends Context.Tag("ClaudeCli")<
  ClaudeCli,
  {
    readonly query: (params: QueryParams) => Stream.Stream<ClaudeEvent, ClaudeCliError, never>
    readonly resume: (params: ResumeParams) => Stream.Stream<ClaudeEvent, ClaudeCliError, never>
    readonly continue_: (params: ContinueParams) => Stream.Stream<ClaudeEvent, ClaudeCliError, never>
  }
>() {}
