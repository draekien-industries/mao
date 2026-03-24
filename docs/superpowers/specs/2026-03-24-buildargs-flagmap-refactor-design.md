# buildArgs FlagMap Refactor

## Problem

The current `buildArgs` function has two bugs caused by the `extra` args indirection pattern:

1. **`resume()` emits both `--resume <id>` AND `--session-id <id>`** — `ResumeParams` makes `session_id` required, and `buildArgs` unconditionally emits `--session-id` when `session_id` is truthy, while `resume()` also passes `--resume <id>` via the `extra` array.

2. **`continue_()` can emit `--session-id` alongside `--continue`** — `ContinueParams` inherits `session_id` as optional from `QueryParams`. If a caller passes `session_id`, the output includes both flags.

Per the [Claude CLI reference](https://code.claude.com/docs/en/cli-reference):
- `--resume <id>` takes a session ID as its own argument — no `--session-id` needed
- `--continue` resumes the most recent conversation in the CWD — must not combine with `--session-id`
- `--session-id` is a standalone flag for `query()` only

## Design

### Flag Descriptor System

A `FlagDef` discriminated union with 5 kinds, defined as an Effect Schema so the type and validation stay in sync. The `FlagDef` TypeScript type is derived from the schema.

```typescript
export const FlagDefSchema = Schema.Union(
  Schema.Struct({ kind: Schema.Literal("string"),           flag: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("number"),           flag: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("boolean"),          flag: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("variadic"),         flag: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("compound-boolean"), flags: Schema.Array(Schema.String) }),
)

export type FlagDef = Schema.Schema.Type<typeof FlagDefSchema>
```

Serialization per kind:
- `"string"` — emit `--flag value` (skip if null/undefined/empty)
- `"number"` — emit `--flag String(value)` (skip if undefined; 0 is valid)
- `"boolean"` — emit `--flag` only when `true`
- `"variadic"` — emit `--flag item1 item2 ...` (skip if empty array)
- `"compound-boolean"` — emit all flags in the array when `true`

```typescript
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
```

### Shared Fields and Flag Map

To avoid repeating field names across two parallel structures, a combined `sharedDefs` object co-locates each field's schema and its CLI flag. Two extraction helpers derive `sharedSchemaFields` and `sharedFlagMap` from it.

```typescript
// extractSchemas: `as` is unavoidable — Object.fromEntries loses key types and the values
// are Effect Schema instances, not data, so Schema.decodeSync doesn't apply here.
const extractSchemas = <T extends Record<string, { schema: any }>>(defs: T) =>
  Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, v.schema])) as {
    [K in keyof T]: T[K]["schema"]
  }

// extractFlagMap: uses Schema.decodeSync with FlagDefSchema — no `as` cast needed.
const FlagMapSchema = Schema.Record({ key: Schema.String, value: FlagDefSchema })

const extractFlagMap = <T extends Record<string, { schema: any; flag?: FlagDef }>>(defs: T) =>
  Schema.decodeSync(FlagMapSchema)(
    Object.fromEntries(
      Object.entries(defs).filter(([, v]) => v.flag !== undefined).map(([k, v]) => [k, v.flag!])
    )
  )

// Single source of truth — each field defined once
const sharedDefs = {
  prompt:                   { schema: Schema.String,                               flag: Flags.prompt },
  model:                    { schema: Schema.optional(Schema.String),              flag: Flags.model },
  append_system_prompt:     { schema: Schema.optional(Schema.String),              flag: Flags.append_system_prompt },
  allowed_tools:            { schema: Schema.optional(Schema.Array(Schema.String)), flag: Flags.allowed_tools },
  max_turns:                { schema: Schema.optional(Schema.Number),              flag: Flags.max_turns },
  max_budget_usd:           { schema: Schema.optional(Schema.Number),              flag: Flags.max_budget_usd },
  bare:                     { schema: Schema.optional(Schema.Boolean),             flag: Flags.bare },
  include_partial_messages: { schema: Schema.optional(Schema.Boolean),             flag: Flags.include_partial_messages },
  name:                     { schema: Schema.optional(Schema.String),              flag: Flags.name },
  cwd:                      { schema: Schema.optional(Schema.String) },            // no flag — not a CLI arg
}

const sharedSchemaFields = extractSchemas(sharedDefs)
const sharedFlagMap = extractFlagMap(sharedDefs)

const baseCommandFlags = ["--output-format", "stream-json"] as const
```

**Implementation note**: Verify that TypeScript resolves the `[K in keyof T]: T[K]["schema"]` mapped type precisely enough for `Schema.Class` to infer the correct instance type when spreading `sharedSchemaFields`. If inference fails, define `sharedSchemaFields` as an explicit object literal (fallback) while keeping `extractFlagMap` for the flag map — the extraction helpers remain useful regardless.

### Schema Classes

**QueryParams** — adds optional `session_id` mapped to `--session-id`:

```typescript
export class QueryParams extends Schema.Class<QueryParams>("QueryParams")({
  ...sharedSchemaFields,
  session_id: Schema.optional(Schema.String),
}) {
  static readonly flagMap = { ...sharedFlagMap, session_id: Flags.session_id }
  static readonly commandFlags = [...baseCommandFlags]
}
```

**ResumeParams** — required `session_id` mapped to `--resume`, adds optional `fork`:

```typescript
export class ResumeParams extends Schema.Class<ResumeParams>("ResumeParams")({
  ...sharedSchemaFields,
  session_id: Schema.String,
  fork: Schema.optional(Schema.Boolean),
}) {
  static readonly flagMap = { ...sharedFlagMap, session_id: Flags.resume, fork: Flags.fork }
  static readonly commandFlags = [...baseCommandFlags]
}
```

**ContinueParams** — no `session_id` field, `--continue` as a command flag:

```typescript
export class ContinueParams extends Schema.Class<ContinueParams>("ContinueParams")({
  ...sharedSchemaFields,
}) {
  static readonly flagMap = { ...sharedFlagMap }
  static readonly commandFlags = [...baseCommandFlags, "--continue"]
}
```

### Generic `buildArgs`

Fully generic — no hardcoded flags, no `extra` parameter.

**Flag ordering**: `commandFlags` are prepended (first in the output array), then `flagMap` entries follow in insertion order. The resulting output will start with `--output-format stream-json` before `-p <prompt>`. The Claude CLI uses a standard flag parser and is order-insensitive for named flags, so this is safe. The "minimal prompt → base flags" test must be updated to reflect the new order: `["--output-format", "stream-json", "-p", "Hello"]`.

```typescript
type ParamClass = {
  readonly flagMap: Record<string, FlagDef>
  readonly commandFlags: readonly string[]
}

export const buildArgs = (
  params: QueryParams | ResumeParams | ContinueParams,
  ParamType: ParamClass,
): string[] => {
  const args: string[] = [...ParamType.commandFlags]

  for (const [field, def] of Object.entries(ParamType.flagMap)) {
    const value = (params as Record<string, unknown>)[field]

    switch (def.kind) {
      case "string":
        if (value != null && value !== "") args.push(def.flag, value as string)
        break
      case "number":
        if (value !== undefined) args.push(def.flag, String(value))
        break
      case "boolean":
        if (value === true) args.push(def.flag)
        break
      case "variadic":
        if (Array.isArray(value) && value.length > 0) args.push(def.flag, ...value)
        break
      case "compound-boolean":
        if (value === true) args.push(...def.flags)
        break
    }
  }

  return args
}
```

### Service Layer Changes

**`buildStream`** — drops `extraArgs`, takes `ParamType`:

```typescript
const buildStream = (
  params: QueryParams | ResumeParams | ContinueParams,
  ParamType: ParamClass,
) => {
  const args = buildArgs(params, ParamType)
  // rest unchanged
}
```

**`ClaudeCliLive`** — each method passes its class reference:

```typescript
return {
  query: (params) => provide(buildStream(params, QueryParams)),
  resume: (params) => provide(buildStream(params, ResumeParams)),
  continue_: (params) => provide(buildStream(params, ContinueParams)),
}
```

**Import change**: `ResumeParams` and `ContinueParams` change from `import type` to value imports.

## Files to Modify

- `src/services/claude-cli/params.ts` — Add FlagDef types, Flags, sharedFields, sharedFlagMap, baseCommandFlags. Rewrite three schema classes with static flagMap and commandFlags.
- `src/services/claude-cli/service.ts` — Rewrite buildArgs (generic loop), simplify buildStream and ClaudeCliLive. Change type imports to value imports.
- `src/services/claude-cli/__tests__/params.test.ts` — Update all buildArgs calls to new signature. Remove "extra args" test. Add ResumeParams, ContinueParams, and edge case tests.
- `src/services/claude-cli/__tests__/service.test.ts` — Update resume/continue buildArgs tests to new signature.

**Unchanged**: `service-definition.ts`, `errors.ts`, `events.ts`, and their test files.

## Test Plan

**Existing tests to update** (signature change `buildArgs(params, [])` → `buildArgs(params, QueryParams)`):
- minimal prompt
- --model, --append-system-prompt, --allowedTools, --max-turns, --max-budget-usd
- --bare true/false
- --session-id
- --name
- --max-turns 0, --max-budget-usd 0
- --verbose + --include-partial-messages

**Test to remove**:
- "extra args are appended after base flags" (extra param no longer exists)

**New tests to add**:
- ResumeParams emits `--resume` and does NOT emit `--session-id`
- ResumeParams with `fork: true` emits `--fork-session`
- ResumeParams with `fork: false/undefined` does NOT emit `--fork-session`
- ContinueParams emits `--continue`
- ContinueParams output array does not contain `"--session-id"` (assert explicitly, not just by schema exclusion)
- Empty `allowed_tools` array does not emit `--allowedTools`
- All classes emit `--output-format stream-json` from commandFlags

**Tests in service.test.ts to REMOVE**:
The three `buildArgs`-only tests in `service.test.ts` (resume args, resume+fork, continue_ args) should be deleted. Coverage moves to `params.test.ts` with the new ResumeParams/ContinueParams tests above. The `service.test.ts` file should only contain stream pipeline tests that exercise `ClaudeCliLive` end-to-end.

**Verification**: run `npm test` (or project test command) to confirm all tests pass.
