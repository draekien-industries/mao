import { Schema } from "effect";

export class ClaudeCliSpawnError extends Schema.TaggedError<ClaudeCliSpawnError>()(
  "ClaudeCliSpawnError",
  { message: Schema.String, cause: Schema.String },
) {}

export class ClaudeCliParseError extends Schema.TaggedError<ClaudeCliParseError>()(
  "ClaudeCliParseError",
  { raw: Schema.String, cause: Schema.String },
) {}

export class ClaudeCliProcessError extends Schema.TaggedError<ClaudeCliProcessError>()(
  "ClaudeCliProcessError",
  { exitCode: Schema.Number, stderr: Schema.String },
) {}

export const ClaudeCliErrorSchema = Schema.Union(
  ClaudeCliSpawnError,
  ClaudeCliParseError,
  ClaudeCliProcessError,
);

export type ClaudeCliError = Schema.Schema.Type<typeof ClaudeCliErrorSchema>;

export function formatClaudeCliError(err: ClaudeCliError): string {
  switch (err._tag) {
    case "ClaudeCliSpawnError":
      return `Failed to start Claude CLI: ${err.message}`;
    case "ClaudeCliProcessError":
      return `Claude CLI exited with code ${err.exitCode}: ${err.stderr}`;
    case "ClaudeCliParseError":
      return `Failed to parse CLI output: ${err.raw}`;
  }
}
