import { Schema } from "effect"

export class QueryParams extends Schema.Class<QueryParams>("QueryParams")({
  prompt: Schema.String,
  model: Schema.optional(Schema.String),
  append_system_prompt: Schema.optional(Schema.String), // maps to --append-system-prompt
  allowed_tools: Schema.optional(Schema.Array(Schema.String)),
  max_turns: Schema.optional(Schema.Number),
  max_budget_usd: Schema.optional(Schema.Number),
  bare: Schema.optional(Schema.Boolean),
  include_partial_messages: Schema.optional(Schema.Boolean), // requires --verbose
  session_id: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
}) {}

// session_id is required for resume — spread QueryParams.fields and override
export class ResumeParams extends Schema.Class<ResumeParams>("ResumeParams")({
  ...QueryParams.fields,
  session_id: Schema.String, // required (overrides optional in QueryParams)
  fork: Schema.optional(Schema.Boolean),
}) {}

export class ContinueParams extends Schema.Class<ContinueParams>("ContinueParams")({
  ...QueryParams.fields,
}) {}
