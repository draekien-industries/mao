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

const FlagMapSchema = Schema.Record({ key: Schema.String, value: FlagDefSchema })

// extractSchemas: `as` cast is unavoidable — Object.fromEntries loses key types and
// Schema instances cannot be decoded with Schema.decodeSync.
const extractSchemas = <T extends Record<string, { schema: any }>>(defs: T) =>
  Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, v.schema])) as {
    [K in keyof T]: T[K]["schema"]
  }

// extractFlagMap: uses Schema.decodeSync with FlagDefSchema — no `as` cast needed.
const extractFlagMap = <T extends Record<string, { schema: any; flag?: FlagDef }>>(defs: T) =>
  Schema.decodeSync(FlagMapSchema)(
    Object.fromEntries(
      Object.entries(defs)
        .filter(([, v]) => v.flag !== undefined)
        .map(([k, v]) => [k, v.flag!]),
    ),
  )

// Single source of truth — each shared field defined once with schema + flag
const sharedDefs = {
  prompt:                   { schema: Schema.String,                                flag: Flags.prompt },
  model:                    { schema: Schema.optional(Schema.String),               flag: Flags.model },
  append_system_prompt:     { schema: Schema.optional(Schema.String),               flag: Flags.append_system_prompt },
  allowed_tools:            { schema: Schema.optional(Schema.Array(Schema.String)), flag: Flags.allowed_tools },
  max_turns:                { schema: Schema.optional(Schema.Number),               flag: Flags.max_turns },
  max_budget_usd:           { schema: Schema.optional(Schema.Number),               flag: Flags.max_budget_usd },
  bare:                     { schema: Schema.optional(Schema.Boolean),              flag: Flags.bare },
  include_partial_messages: { schema: Schema.optional(Schema.Boolean),              flag: Flags.include_partial_messages },
  name:                     { schema: Schema.optional(Schema.String),               flag: Flags.name },
  cwd:                      { schema: Schema.optional(Schema.String) },             // no flag — not a CLI arg
}

const sharedSchemaFields = extractSchemas(sharedDefs)
const sharedFlagMap = extractFlagMap(sharedDefs)

const baseCommandFlags = ["--output-format", "stream-json"] as const

export class QueryParams extends Schema.Class<QueryParams>("QueryParams")({
  ...sharedSchemaFields,
  session_id: Schema.optional(Schema.String),
}) {
  static readonly flagMap = { ...sharedFlagMap, session_id: Flags.session_id }
  static readonly commandFlags = [...baseCommandFlags]
}

// session_id is required for resume; maps to --resume (not --session-id)
export class ResumeParams extends Schema.Class<ResumeParams>("ResumeParams")({
  ...sharedSchemaFields,
  session_id: Schema.String,
  fork: Schema.optional(Schema.Boolean),
}) {
  static readonly flagMap = { ...sharedFlagMap, session_id: Flags.resume, fork: Flags.fork }
  static readonly commandFlags = [...baseCommandFlags]
}

// --continue is a command flag (not a field), and session_id is excluded
export class ContinueParams extends Schema.Class<ContinueParams>("ContinueParams")({
  ...sharedSchemaFields,
}) {
  static readonly flagMap = { ...sharedFlagMap }
  static readonly commandFlags = [...baseCommandFlags, "--continue"]
}
