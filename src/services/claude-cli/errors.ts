import { Schema } from "effect"

export class ClaudeCliSpawnError extends Schema.TaggedError<ClaudeCliSpawnError>()(
  "ClaudeCliSpawnError",
  { message: Schema.String, cause: Schema.Unknown },
) {}

export class ClaudeCliParseError extends Schema.TaggedError<ClaudeCliParseError>()(
  "ClaudeCliParseError",
  { raw: Schema.String, cause: Schema.Unknown },
) {}

export class ClaudeCliProcessError extends Schema.TaggedError<ClaudeCliProcessError>()(
  "ClaudeCliProcessError",
  { exitCode: Schema.Number, stderr: Schema.String },
) {}

export type ClaudeCliError = ClaudeCliSpawnError | ClaudeCliParseError | ClaudeCliProcessError
