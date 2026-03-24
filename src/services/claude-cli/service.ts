import { Command, CommandExecutor } from "@effect/platform"
import { Effect, Fiber, Layer, Schema, Stream } from "effect"
import { ClaudeCliParseError, ClaudeCliProcessError, ClaudeCliSpawnError } from "./errors"
import { ClaudeEvent } from "./events"
import type { ContinueParams, ResumeParams } from "./params"
import { QueryParams } from "./params"
import { ClaudeCli } from "./service-definition"

export const buildArgs = (params: QueryParams, extra: readonly string[]): string[] => {
  const args = ["-p", params.prompt, "--output-format", "stream-json", ...extra]
  if (params.model) args.push("--model", params.model)
  if (params.append_system_prompt) args.push("--append-system-prompt", params.append_system_prompt)
  if (params.allowed_tools?.length) args.push("--allowedTools", ...params.allowed_tools)
  if (params.max_turns !== undefined) args.push("--max-turns", String(params.max_turns))
  if (params.max_budget_usd !== undefined) args.push("--max-budget-usd", String(params.max_budget_usd))
  if (params.bare) args.push("--bare")
  if (params.session_id) args.push("--session-id", params.session_id)
  if (params.name) args.push("--name", params.name)
  if (params.include_partial_messages) args.push("--verbose", "--include-partial-messages")
  return args
}
