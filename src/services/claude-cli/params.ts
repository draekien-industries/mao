import { Schema } from "effect";

export type FlagDef =
  | { readonly kind: "string"; readonly flag: string }
  | { readonly kind: "number"; readonly flag: string }
  | { readonly kind: "boolean"; readonly flag: string }
  | { readonly kind: "variadic"; readonly flag: string };

const Flags = {
  prompt: { kind: "string", flag: "-p" },
  model: { kind: "string", flag: "--model" },
  append_system_prompt: { kind: "string", flag: "--append-system-prompt" },
  allowed_tools: { kind: "variadic", flag: "--allowedTools" },
  max_turns: { kind: "number", flag: "--max-turns" },
  max_budget_usd: { kind: "number", flag: "--max-budget-usd" },
  bare: { kind: "boolean", flag: "--bare" },
  session_id: { kind: "string", flag: "--session-id" },
  resume: { kind: "string", flag: "--resume" },
  name: { kind: "string", flag: "--name" },
  fork: { kind: "boolean", flag: "--fork-session" },
} as const satisfies Record<string, FlagDef>;

const sharedSchemaFields = {
  prompt: Schema.String,
  model: Schema.optional(Schema.String),
  append_system_prompt: Schema.optional(Schema.String),
  allowed_tools: Schema.optional(Schema.Array(Schema.String)),
  max_turns: Schema.optional(Schema.Number),
  max_budget_usd: Schema.optional(Schema.Number),
  bare: Schema.optional(Schema.Boolean),
  name: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
};

const sharedFlagMap: Record<string, FlagDef> = {
  prompt: Flags.prompt,
  model: Flags.model,
  append_system_prompt: Flags.append_system_prompt,
  allowed_tools: Flags.allowed_tools,
  max_turns: Flags.max_turns,
  max_budget_usd: Flags.max_budget_usd,
  bare: Flags.bare,
  name: Flags.name,
};

const baseCommandFlags = [
  "--output-format",
  "stream-json",
  "--verbose",
  "--include-partial-messages",
] as const;

export class QueryParams extends Schema.Class<QueryParams>("QueryParams")({
  ...sharedSchemaFields,
  session_id: Schema.optional(Schema.String),
}) {
  static readonly flagMap = { ...sharedFlagMap, session_id: Flags.session_id };
  static readonly commandFlags = [...baseCommandFlags];
}

// session_id is required for resume; maps to --resume (not --session-id)
export class ResumeParams extends Schema.Class<ResumeParams>("ResumeParams")({
  ...sharedSchemaFields,
  session_id: Schema.String,
  fork: Schema.optional(Schema.Boolean),
}) {
  static readonly flagMap = {
    ...sharedFlagMap,
    session_id: Flags.resume,
    fork: Flags.fork,
  };
  static readonly commandFlags = [...baseCommandFlags];
}

// --continue is a command flag (not a field), and session_id is excluded
export class ContinueParams extends Schema.Class<ContinueParams>(
  "ContinueParams",
)({
  ...sharedSchemaFields,
}) {
  static readonly flagMap = { ...sharedFlagMap };
  static readonly commandFlags = [...baseCommandFlags, "--continue"];
}
