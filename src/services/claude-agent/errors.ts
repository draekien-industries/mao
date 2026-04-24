import { Schema } from "effect";

export class ClaudeAgentSpawnError extends Schema.TaggedError<ClaudeAgentSpawnError>()(
  "ClaudeAgentSpawnError",
  { message: Schema.String, cause: Schema.String },
) {}

export class ClaudeAgentParseError extends Schema.TaggedError<ClaudeAgentParseError>()(
  "ClaudeAgentParseError",
  { raw: Schema.String, cause: Schema.String },
) {}

export class ClaudeAgentProcessError extends Schema.TaggedError<ClaudeAgentProcessError>()(
  "ClaudeAgentProcessError",
  { message: Schema.String, cause: Schema.String },
) {}

export const ClaudeAgentErrorSchema = Schema.Union(
  ClaudeAgentSpawnError,
  ClaudeAgentParseError,
  ClaudeAgentProcessError,
);
export type ClaudeAgentError = typeof ClaudeAgentErrorSchema.Type;

export const formatClaudeAgentError = (err: ClaudeAgentError): string => {
  switch (err._tag) {
    case "ClaudeAgentSpawnError":
      return `Failed to start Claude Agent: ${err.message}`;
    case "ClaudeAgentParseError":
      return `Failed to parse SDK message: ${err.raw}`;
    case "ClaudeAgentProcessError":
      return `Claude Agent failed: ${err.message}`;
  }
};
