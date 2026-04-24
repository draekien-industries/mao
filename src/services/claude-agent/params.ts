import { Schema } from "effect";

const sharedFields = {
  prompt: Schema.String,
  model: Schema.optional(Schema.String),
  append_system_prompt: Schema.optional(Schema.String),
  allowed_tools: Schema.optional(Schema.Array(Schema.String)),
  max_turns: Schema.optional(Schema.Number),
  cwd: Schema.optional(Schema.String),
};

export class QueryParams extends Schema.Class<QueryParams>("QueryParams")({
  ...sharedFields,
  session_id: Schema.optional(Schema.String),
}) {}

export class ResumeParams extends Schema.Class<ResumeParams>("ResumeParams")({
  ...sharedFields,
  session_id: Schema.String,
  fork: Schema.optional(Schema.Boolean),
}) {}

export class ContinueParams extends Schema.Class<ContinueParams>(
  "ContinueParams",
)({
  ...sharedFields,
}) {}
