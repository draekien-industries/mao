import { Schema } from "effect"

export const FlagDefSchema = Schema.Union(
  Schema.Struct({ kind: Schema.Literal("string"),           flag: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("number"),           flag: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("boolean"),          flag: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("variadic"),         flag: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("compound-boolean"), flags: Schema.Array(Schema.String) }),
)

export type FlagDef = Schema.Schema.Type<typeof FlagDefSchema>

const Flags = {
  prompt:                   { kind: "string",           flag: "-p" },
  model:                    { kind: "string",           flag: "--model" },
  append_system_prompt:     { kind: "string",           flag: "--append-system-prompt" },
  allowed_tools:            { kind: "variadic",         flag: "--allowedTools" },
  max_turns:                { kind: "number",           flag: "--max-turns" },
  max_budget_usd:           { kind: "number",           flag: "--max-budget-usd" },
  bare:                     { kind: "boolean",          flag: "--bare" },
  session_id:               { kind: "string",           flag: "--session-id" },
  resume:                   { kind: "string",           flag: "--resume" },
  name:                     { kind: "string",           flag: "--name" },
  include_partial_messages: { kind: "compound-boolean", flags: ["--verbose", "--include-partial-messages"] },
  fork:                     { kind: "boolean",          flag: "--fork-session" },
} as const satisfies Record<string, FlagDef>

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
