# buildArgs FlagMap Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `buildArgs` `extra: string[]` indirection pattern with a generic flag-map loop driven by per-class static `flagMap` and `commandFlags`, eliminating the two resume/continue flag-duplication bugs.

**Architecture:** Each param class (`QueryParams`, `ResumeParams`, `ContinueParams`) declares its own `static flagMap` (field→FlagDef mapping) and `static commandFlags` (literal prefix flags). A single generic `buildArgs` function iterates the flag map and emits args per kind — no hardcoded flags, no `extra` parameter. `ClaudeCliLive` passes the class reference as a `ParamClass` value.

**Tech Stack:** TypeScript, Effect (`effect` v3+, `@effect/schema` via `Schema` re-export), Vitest

---

## File Map

| File | Change |
|------|--------|
| `src/services/claude-cli/params.ts` | Add `FlagDefSchema`, `FlagDef`, `Flags`, shared infrastructure, rewrite three classes with static members |
| `src/services/claude-cli/service.ts` | Add `ParamClass` type, rewrite `buildArgs` (generic loop), simplify `buildStream`, update `ClaudeCliLive`, fix imports |
| `src/services/claude-cli/__tests__/params.test.ts` | Update call signatures, fix order assertion, remove extra-args test, add ResumeParams/ContinueParams/edge-case tests |
| `src/services/claude-cli/__tests__/service.test.ts` | Remove 3 stale buildArgs-only tests |

**Unchanged:** `service-definition.ts`, `errors.ts`, `events.ts`, and their test files.

---

## Task 1: Add FlagDef type system to params.ts

**Files:**
- Modify: `src/services/claude-cli/params.ts`

- [ ] **Step 1: Add FlagDefSchema, FlagDef type, and Flags constant at the top of params.ts (before existing class definitions)**

```typescript
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
```

- [ ] **Step 2: Run typecheck to confirm no type errors**

```bash
npm run typecheck
```

Expected: no errors related to params.ts

- [ ] **Step 3: Commit**

```bash
git add src/services/claude-cli/params.ts
git commit -m "feat: add FlagDefSchema, FlagDef type, and Flags constant to params"
```

---

## Task 2: Add shared infrastructure to params.ts

**Files:**
- Modify: `src/services/claude-cli/params.ts`

- [ ] **Step 1: Add extractors, sharedDefs, sharedSchemaFields, sharedFlagMap, and baseCommandFlags after the Flags constant**

```typescript
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
```

> **TypeScript inference note**: If `Schema.Class` cannot infer the correct instance type when spreading `sharedSchemaFields` (symptoms: `prompt` shows as `unknown`, or constructor requires no arguments), fall back to defining `sharedSchemaFields` as an explicit object literal:
>
> ```typescript
> const sharedSchemaFields = {
>   prompt:                   Schema.String,
>   model:                    Schema.optional(Schema.String),
>   append_system_prompt:     Schema.optional(Schema.String),
>   allowed_tools:            Schema.optional(Schema.Array(Schema.String)),
>   max_turns:                Schema.optional(Schema.Number),
>   max_budget_usd:           Schema.optional(Schema.Number),
>   bare:                     Schema.optional(Schema.Boolean),
>   include_partial_messages: Schema.optional(Schema.Boolean),
>   name:                     Schema.optional(Schema.String),
>   cwd:                      Schema.optional(Schema.String),
> }
> ```
> Keep `extractFlagMap` — it still provides the `sharedFlagMap` regardless.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/services/claude-cli/params.ts
git commit -m "feat: add shared infrastructure (extractors, sharedDefs, flagMap, baseCommandFlags)"
```

---

## Task 3: Rewrite schema classes with static flagMap and commandFlags

**Files:**
- Modify: `src/services/claude-cli/params.ts`

- [ ] **Step 1: Replace the three Schema.Class definitions with versions that include static members**

Remove the existing `QueryParams`, `ResumeParams`, and `ContinueParams` class definitions and replace them with:

```typescript
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
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Run existing tests — they must still pass (buildArgs signature is unchanged yet)**

```bash
npx vitest run src/services/claude-cli/__tests__/params.test.ts
```

Expected: all 13 existing tests pass

- [ ] **Step 4: Commit**

```bash
git add src/services/claude-cli/params.ts
git commit -m "feat: add static flagMap and commandFlags to QueryParams, ResumeParams, ContinueParams"
```

---

## Task 4: Write updated and new tests in params.test.ts

**Files:**
- Modify: `src/services/claude-cli/__tests__/params.test.ts`

All tests call `buildArgs` with the old signature `(params, [])`. After this task they call `(params, ClassName)`. The tests will **fail** until Task 5 implements the new `buildArgs`.

- [ ] **Step 1: Replace the entire file content with the updated test suite**

```typescript
import { describe, expect, it } from "vitest"

describe("buildArgs", () => {
  // --- QueryParams (updated signatures + fixed order) ---

  it("minimal: only prompt → base flags (commandFlags prepended)", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    expect(buildArgs(new QueryParams({ prompt: "Hello" }), QueryParams)).toEqual([
      "--output-format", "stream-json", "-p", "Hello",
    ])
  })

  it("--model", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", model: "claude-opus-4-6" }), QueryParams)
    expect(args).toContain("--model")
    expect(args).toContain("claude-opus-4-6")
  })

  it("--append-system-prompt", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", append_system_prompt: "Be brief" }), QueryParams)
    expect(args).toContain("--append-system-prompt")
    expect(args).toContain("Be brief")
  })

  it("--allowedTools (variadic)", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", allowed_tools: ["Read", "Write"] }), QueryParams)
    const idx = args.indexOf("--allowedTools")
    expect(idx).toBeGreaterThan(-1)
    expect(args[idx + 1]).toBe("Read")
    expect(args[idx + 2]).toBe("Write")
  })

  it("empty allowed_tools does NOT emit --allowedTools", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", allowed_tools: [] }), QueryParams)
    expect(args).not.toContain("--allowedTools")
  })

  it("--max-turns", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_turns: 5 }), QueryParams)
    expect(args).toContain("--max-turns")
    expect(args).toContain("5")
  })

  it("--max-budget-usd", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_budget_usd: 0.5 }), QueryParams)
    expect(args).toContain("--max-budget-usd")
    expect(args).toContain("0.5")
  })

  it("--bare when true", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    expect(buildArgs(new QueryParams({ prompt: "Hi", bare: true }), QueryParams)).toContain("--bare")
  })

  it("no --bare when false", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    expect(buildArgs(new QueryParams({ prompt: "Hi", bare: false }), QueryParams)).not.toContain("--bare")
  })

  it("--session-id", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", session_id: "sess_01" }), QueryParams)
    expect(args).toContain("--session-id")
    expect(args).toContain("sess_01")
  })

  it("--name", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", name: "my-session" }), QueryParams)
    expect(args).toContain("--name")
    expect(args).toContain("my-session")
  })

  it("--max-turns with value 0 (undefined guard, not falsy)", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_turns: 0 }), QueryParams)
    expect(args).toContain("--max-turns")
    expect(args).toContain("0")
  })

  it("--max-budget-usd with value 0 (undefined guard, not falsy)", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_budget_usd: 0 }), QueryParams)
    expect(args).toContain("--max-budget-usd")
    expect(args).toContain("0")
  })

  it("--verbose and --include-partial-messages together", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", include_partial_messages: true }), QueryParams)
    expect(args).toContain("--verbose")
    expect(args).toContain("--include-partial-messages")
  })

  it("all classes emit --output-format stream-json from commandFlags", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams, ResumeParams, ContinueParams } = await import("../params")
    const q = buildArgs(new QueryParams({ prompt: "Hi" }), QueryParams)
    const r = buildArgs(new ResumeParams({ prompt: "Hi", session_id: "sess_01" }), ResumeParams)
    const c = buildArgs(new ContinueParams({ prompt: "Hi" }), ContinueParams)
    for (const args of [q, r, c]) {
      expect(args).toContain("--output-format")
      expect(args).toContain("stream-json")
    }
  })

  // --- ResumeParams ---

  it("ResumeParams emits --resume <id> and NOT --session-id", async () => {
    const { buildArgs } = await import("../service")
    const { ResumeParams } = await import("../params")
    const args = buildArgs(new ResumeParams({ prompt: "Hi", session_id: "sess_01" }), ResumeParams)
    expect(args).toContain("--resume")
    expect(args).toContain("sess_01")
    expect(args).not.toContain("--session-id")
  })

  it("ResumeParams with fork: true emits --fork-session", async () => {
    const { buildArgs } = await import("../service")
    const { ResumeParams } = await import("../params")
    const args = buildArgs(new ResumeParams({ prompt: "Hi", session_id: "sess_01", fork: true }), ResumeParams)
    expect(args).toContain("--fork-session")
  })

  it("ResumeParams with fork: false does NOT emit --fork-session", async () => {
    const { buildArgs } = await import("../service")
    const { ResumeParams } = await import("../params")
    const args = buildArgs(new ResumeParams({ prompt: "Hi", session_id: "sess_01", fork: false }), ResumeParams)
    expect(args).not.toContain("--fork-session")
  })

  it("ResumeParams with fork: undefined does NOT emit --fork-session", async () => {
    const { buildArgs } = await import("../service")
    const { ResumeParams } = await import("../params")
    const args = buildArgs(new ResumeParams({ prompt: "Hi", session_id: "sess_01" }), ResumeParams)
    expect(args).not.toContain("--fork-session")
  })

  // --- ContinueParams ---

  it("ContinueParams emits --continue", async () => {
    const { buildArgs } = await import("../service")
    const { ContinueParams } = await import("../params")
    const args = buildArgs(new ContinueParams({ prompt: "Hi" }), ContinueParams)
    expect(args).toContain("--continue")
  })

  it("ContinueParams does NOT contain --session-id", async () => {
    const { buildArgs } = await import("../service")
    const { ContinueParams } = await import("../params")
    const args = buildArgs(new ContinueParams({ prompt: "Hi" }), ContinueParams)
    expect(args).not.toContain("--session-id")
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail with the expected error (wrong arg count / type mismatch at runtime)**

```bash
npx vitest run src/services/claude-cli/__tests__/params.test.ts
```

Expected: tests fail — `buildArgs` still expects `(params, string[])` and `QueryParams` is not a string array

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/services/claude-cli/__tests__/params.test.ts
git commit -m "test: update buildArgs signatures and add ResumeParams/ContinueParams tests (failing)"
```

---

## Task 5: Rewrite buildArgs, buildStream, and ClaudeCliLive in service.ts

**Files:**
- Modify: `src/services/claude-cli/service.ts`

- [ ] **Step 1: Add the `ParamClass` type and `FlagDef` import, then replace `buildArgs`**

Change the import line from:
```typescript
import type { ContinueParams, ResumeParams } from "./params"
import { QueryParams } from "./params"
```
to:
```typescript
import { ContinueParams, FlagDef, QueryParams, ResumeParams } from "./params"
```

Add the `ParamClass` type and replace `buildArgs` (the existing `buildArgs` function at line 9):

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

- [ ] **Step 2: Update `buildStream` to drop `extraArgs` and accept `ParamType`**

Replace the existing `buildStream` signature and body opening:
```typescript
// OLD
const buildStream = (
  params: QueryParams,
  extraArgs: readonly string[],
): Stream.Stream<...> => {
  const args = buildArgs(params, extraArgs)
```

With:
```typescript
// NEW
const buildStream = (
  params: QueryParams | ResumeParams | ContinueParams,
  ParamType: ParamClass,
): Stream.Stream<ClaudeEvent, ClaudeCliSpawnError | ClaudeCliParseError | ClaudeCliProcessError, CommandExecutor.CommandExecutor> => {
  const args = buildArgs(params, ParamType)
```

The rest of `buildStream` (the `command`, `Stream.unwrapScoped`, `Effect.gen` block) stays unchanged.

- [ ] **Step 3: Update `ClaudeCliLive` methods to pass class references**

Replace the return object in `ClaudeCliLive`:
```typescript
// OLD
return {
  query: (params: QueryParams) => provide(buildStream(params, [])),
  resume: (params: ResumeParams) =>
    provide(
      buildStream(params, [
        "--resume",
        params.session_id,
        ...(params.fork ? ["--fork-session"] : []),
      ]),
    ),
  continue_: (params: ContinueParams) => provide(buildStream(params, ["--continue"])),
}
```

With:
```typescript
// NEW
return {
  query: (params: QueryParams) => provide(buildStream(params, QueryParams)),
  resume: (params: ResumeParams) => provide(buildStream(params, ResumeParams)),
  continue_: (params: ContinueParams) => provide(buildStream(params, ContinueParams)),
}
```

- [ ] **Step 4: Run params.test.ts — all tests must pass**

```bash
npx vitest run src/services/claude-cli/__tests__/params.test.ts
```

Expected: all 21 tests pass

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/services/claude-cli/service.ts
git commit -m "feat: rewrite buildArgs as generic flag-map loop, simplify buildStream and ClaudeCliLive"
```

---

## Task 6: Remove stale buildArgs tests from service.test.ts and run full suite

**Files:**
- Modify: `src/services/claude-cli/__tests__/service.test.ts`

The three tests at the bottom of `service.test.ts` test resume/continue `buildArgs` behavior using the old extra-args signature. This coverage moves to `params.test.ts`. Delete them.

- [ ] **Step 1: Remove the three buildArgs-only tests from service.test.ts**

Remove these three `it` blocks (currently lines 119–141):
- `"resume() appends --resume and session_id to args"`
- `"resume() with fork appends --fork-session"`
- `"continue_() appends --continue to args"`

The file should end after the `"empty lines in stdout are ignored"` test block.

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests pass — no failures, no skips

- [ ] **Step 3: Commit**

```bash
git add src/services/claude-cli/__tests__/service.test.ts
git commit -m "test: remove stale buildArgs tests from service.test.ts (coverage moved to params.test.ts)"
```
