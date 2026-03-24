# Claude CLI Wrapper Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Also read: @effect-ts skill before touching any Effect code.

**Goal:** Build an Effect.js service that wraps the `claude` CLI binary, exposing typed streaming operations (`query`, `resume`, `continue_`) for use in the Electron main process.

**Architecture:** `@effect/platform`'s `Command` module spawns `claude -p --output-format stream-json` as a child process. Stdout is parsed line-by-line as NDJSON and decoded via an Effect Schema union into typed `ClaudeEvent` values, surfaced as `Stream.Stream<ClaudeEvent, ClaudeCliError>`. `ClaudeCliLive` uses `Layer.effect` to capture `CommandExecutor` at build time and provides it to each stream via `Stream.provideService`, so the service interface stays self-contained (R = `never`).

**Tech Stack:** Effect v3 (`effect`, `@effect/platform`, `@effect/platform-node`), Vitest, TypeScript strict

**Spec:** `docs/superpowers/specs/2026-03-24-claude-cli-wrapper-design.md`

---

## File Structure

**New source files:**
- `src/services/claude-cli/errors.ts` — `ClaudeCliSpawnError`, `ClaudeCliParseError`, `ClaudeCliProcessError`, `ClaudeCliError` union type
- `src/services/claude-cli/events.ts` — all Schema classes for CLI stream-json events and nested API streaming events
- `src/services/claude-cli/params.ts` — `QueryParams`, `ResumeParams`, `ContinueParams` Schema classes
- `src/services/claude-cli/service-definition.ts` — `ClaudeCli` `Context.Tag`
- `src/services/claude-cli/service.ts` — `buildArgs` (exported, pure), `buildStream` (private), `ClaudeCliLive` layer

**New test files:**
- `src/services/claude-cli/__tests__/errors.test.ts` — instantiation + field checks for all 3 error types
- `src/services/claude-cli/__tests__/events.test.ts` — `Schema.decodeUnknown` round-trips using real CLI JSON samples
- `src/services/claude-cli/__tests__/params.test.ts` — `buildArgs` unit tests for every flag combination
- `src/services/claude-cli/__tests__/service.test.ts` — stream pipeline tests with a mock `CommandExecutor` layer

**New config files:**
- `vitest.config.mts` — Vitest config (Node environment, `@` path alias)

**Modified:**
- `package.json` — add `effect`, `@effect/platform`, `@effect/platform-node` to dependencies; `vitest` to devDependencies; add `test` scripts

No barrel `index.ts` — consumers import directly from the file they need.

---

### Task 1: Install dependencies and configure Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.mts`

- [ ] **Step 1: Install Effect packages**

```bash
npm install effect @effect/platform @effect/platform-node
```

- [ ] **Step 2: Install Vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Step 3: Add test scripts to `package.json`**

In the `"scripts"` block, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create `vitest.config.mts`**

```typescript
import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 5: Verify Vitest starts without crashing**

```bash
npm test
```

Expected: exits cleanly (reports 0 test files or similar — no crash)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.mts
git commit -m "chore: add effect, @effect/platform, and vitest"
```

---

### Task 2: `errors.ts` — TaggedError classes

**Files:**
- Create: `src/services/claude-cli/errors.ts`
- Create: `src/services/claude-cli/__tests__/errors.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/services/claude-cli/__tests__/errors.test.ts`:

```typescript
import { describe, expect, it } from "vitest"

describe("ClaudeCliSpawnError", () => {
  it("has correct _tag and fields", async () => {
    const { ClaudeCliSpawnError } = await import("../errors")
    const err = new ClaudeCliSpawnError({ message: "not found", cause: new Error("ENOENT") })
    expect(err._tag).toBe("ClaudeCliSpawnError")
    expect(err.message).toBe("not found")
  })
})

describe("ClaudeCliParseError", () => {
  it("has correct _tag and fields", async () => {
    const { ClaudeCliParseError } = await import("../errors")
    const err = new ClaudeCliParseError({ raw: "{bad}", cause: new SyntaxError("Unexpected token") })
    expect(err._tag).toBe("ClaudeCliParseError")
    expect(err.raw).toBe("{bad}")
  })
})

describe("ClaudeCliProcessError", () => {
  it("has correct _tag and fields", async () => {
    const { ClaudeCliProcessError } = await import("../errors")
    const err = new ClaudeCliProcessError({ exitCode: 1, stderr: "rate limit" })
    expect(err._tag).toBe("ClaudeCliProcessError")
    expect(err.exitCode).toBe(1)
    expect(err.stderr).toBe("rate limit")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/services/claude-cli/__tests__/errors.test.ts
```

Expected: FAIL — "Cannot find module '../errors'"

- [ ] **Step 3: Implement `src/services/claude-cli/errors.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/services/claude-cli/__tests__/errors.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/claude-cli/errors.ts src/services/claude-cli/__tests__/errors.test.ts
git commit -m "feat: add ClaudeCliError types"
```

---

### Task 3: `events.ts` — shared primitives

**Files:**
- Create: `src/services/claude-cli/events.ts` (primitives section only)
- Create: `src/services/claude-cli/__tests__/events.test.ts` (primitive tests only)

- [ ] **Step 1: Write failing tests for primitives**

Create `src/services/claude-cli/__tests__/events.test.ts`:

```typescript
import { Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"

describe("Usage", () => {
  it("decodes full object", async () => {
    const { Usage } = await import("../events")
    const raw = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 10 }
    const result = await Effect.runPromise(Schema.decodeUnknown(Usage)(raw))
    expect(result.input_tokens).toBe(100)
    expect(result.output_tokens).toBe(50)
  })

  it("decodes with all fields missing (all optional)", async () => {
    const { Usage } = await import("../events")
    const result = await Effect.runPromise(Schema.decodeUnknown(Usage)({}))
    expect(result.input_tokens).toBeUndefined()
  })
})

describe("ContentBlock union", () => {
  it("decodes TextBlock", async () => {
    const { ContentBlock } = await import("../events")
    const raw = { type: "text", text: "Hello world" }
    const result = await Effect.runPromise(Schema.decodeUnknown(ContentBlock)(raw))
    expect(result.type).toBe("text")
  })

  it("decodes ToolUseBlock", async () => {
    const { ContentBlock } = await import("../events")
    const raw = { type: "tool_use", id: "tool_123", name: "Read", input: { file: "foo.ts" } }
    const result = await Effect.runPromise(Schema.decodeUnknown(ContentBlock)(raw))
    expect(result.type).toBe("tool_use")
    // @ts-expect-error — narrowing to ToolUseBlock
    expect(result.id).toBe("tool_123")
  })
})

describe("ContentDelta union", () => {
  it("decodes TextDelta", async () => {
    const { ContentDelta } = await import("../events")
    const raw = { type: "text_delta", text: " world" }
    const result = await Effect.runPromise(Schema.decodeUnknown(ContentDelta)(raw))
    // @ts-expect-error — narrowing to TextDelta
    expect(result.text).toBe(" world")
  })

  it("decodes InputJsonDelta", async () => {
    const { ContentDelta } = await import("../events")
    const raw = { type: "input_json_delta", partial_json: '{"file":' }
    const result = await Effect.runPromise(Schema.decodeUnknown(ContentDelta)(raw))
    // @ts-expect-error — narrowing to InputJsonDelta
    expect(result.partial_json).toBe('{"file":')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/services/claude-cli/__tests__/events.test.ts
```

Expected: FAIL — "Cannot find module '../events'"

- [ ] **Step 3: Create `src/services/claude-cli/events.ts` with primitives**

```typescript
import { Schema } from "effect"

// Token usage counts (shared by multiple event types)
export class Usage extends Schema.Class<Usage>("Usage")({
  input_tokens: Schema.optional(Schema.Number),
  output_tokens: Schema.optional(Schema.Number),
  cache_creation_input_tokens: Schema.optional(Schema.Number),
  cache_read_input_tokens: Schema.optional(Schema.Number),
}) {}

// Content block variants (text or tool use)
export class TextBlock extends Schema.Class<TextBlock>("TextBlock")({
  type: Schema.Literal("text"),
  text: Schema.String,
}) {}

export class ToolUseBlock extends Schema.Class<ToolUseBlock>("ToolUseBlock")({
  type: Schema.Literal("tool_use"),
  id: Schema.String,
  name: Schema.String,
  input: Schema.Unknown,
}) {}

export const ContentBlock = Schema.Union(TextBlock, ToolUseBlock)
export type ContentBlock = typeof ContentBlock.Type

// Delta variants for streaming content
export class TextDelta extends Schema.Class<TextDelta>("TextDelta")({
  type: Schema.Literal("text_delta"),
  text: Schema.String,
}) {}

export class InputJsonDelta extends Schema.Class<InputJsonDelta>("InputJsonDelta")({
  type: Schema.Literal("input_json_delta"),
  partial_json: Schema.String,
}) {}

export const ContentDelta = Schema.Union(TextDelta, InputJsonDelta)
export type ContentDelta = typeof ContentDelta.Type
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/services/claude-cli/__tests__/events.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/claude-cli/events.ts src/services/claude-cli/__tests__/events.test.ts
git commit -m "feat: add events.ts primitives (Usage, ContentBlock, ContentDelta)"
```

---

### Task 4: `events.ts` — API streaming events

**Files:**
- Modify: `src/services/claude-cli/events.ts` (append API event classes)
- Modify: `src/services/claude-cli/__tests__/events.test.ts` (append tests)

- [ ] **Step 1: Write failing tests for API streaming events**

Append to `src/services/claude-cli/__tests__/events.test.ts`:

```typescript
describe("ApiStreamEvent union", () => {
  it("decodes MessageStartApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events")
    const raw = {
      type: "message_start",
      message: {
        id: "msg_01", type: "message", role: "assistant", content: [],
        model: "claude-opus-4-6", stop_reason: null, stop_sequence: null,
        usage: { input_tokens: 25, output_tokens: 0 },
      },
    }
    const result = await Effect.runPromise(Schema.decodeUnknown(ApiStreamEvent)(raw))
    expect(result.type).toBe("message_start")
  })

  it("decodes ContentBlockStartApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events")
    const raw = { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }
    const result = await Effect.runPromise(Schema.decodeUnknown(ApiStreamEvent)(raw))
    expect(result.type).toBe("content_block_start")
  })

  it("decodes ContentBlockDeltaApiEvent with TextDelta", async () => {
    const { ApiStreamEvent } = await import("../events")
    const raw = { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } }
    const result = await Effect.runPromise(Schema.decodeUnknown(ApiStreamEvent)(raw))
    expect(result.type).toBe("content_block_delta")
  })

  it("decodes ContentBlockStopApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events")
    const result = await Effect.runPromise(Schema.decodeUnknown(ApiStreamEvent)({ type: "content_block_stop", index: 0 }))
    expect(result.type).toBe("content_block_stop")
  })

  it("decodes MessageDeltaApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events")
    const raw = {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 42 },
    }
    const result = await Effect.runPromise(Schema.decodeUnknown(ApiStreamEvent)(raw))
    expect(result.type).toBe("message_delta")
  })

  it("decodes MessageStopApiEvent", async () => {
    const { ApiStreamEvent } = await import("../events")
    const result = await Effect.runPromise(Schema.decodeUnknown(ApiStreamEvent)({ type: "message_stop" }))
    expect(result.type).toBe("message_stop")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/services/claude-cli/__tests__/events.test.ts
```

Expected: FAIL — `ApiStreamEvent` not exported yet

- [ ] **Step 3: Append API event classes to `events.ts`**

```typescript
// API streaming events (nested inside StreamEventMessage.event)
export class MessageStartApiEvent extends Schema.Class<MessageStartApiEvent>("MessageStartApiEvent")({
  type: Schema.Literal("message_start"),
  message: Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("message"),
    role: Schema.Literal("assistant"),
    content: Schema.Array(Schema.Unknown),
    model: Schema.String,
    stop_reason: Schema.NullOr(Schema.String),
    stop_sequence: Schema.NullOr(Schema.String),
    usage: Usage,
  }),
}) {}

export class ContentBlockStartApiEvent extends Schema.Class<ContentBlockStartApiEvent>("ContentBlockStartApiEvent")({
  type: Schema.Literal("content_block_start"),
  index: Schema.Number,
  content_block: ContentBlock,
}) {}

export class ContentBlockDeltaApiEvent extends Schema.Class<ContentBlockDeltaApiEvent>("ContentBlockDeltaApiEvent")({
  type: Schema.Literal("content_block_delta"),
  index: Schema.Number,
  delta: ContentDelta,
}) {}

export class ContentBlockStopApiEvent extends Schema.Class<ContentBlockStopApiEvent>("ContentBlockStopApiEvent")({
  type: Schema.Literal("content_block_stop"),
  index: Schema.Number,
}) {}

export class MessageDeltaApiEvent extends Schema.Class<MessageDeltaApiEvent>("MessageDeltaApiEvent")({
  type: Schema.Literal("message_delta"),
  delta: Schema.Struct({
    stop_reason: Schema.NullOr(Schema.String),
    stop_sequence: Schema.NullOr(Schema.String),
  }),
  usage: Schema.Struct({ output_tokens: Schema.Number }),
}) {}

export class MessageStopApiEvent extends Schema.Class<MessageStopApiEvent>("MessageStopApiEvent")({
  type: Schema.Literal("message_stop"),
}) {}

export const ApiStreamEvent = Schema.Union(
  MessageStartApiEvent,
  ContentBlockStartApiEvent,
  ContentBlockDeltaApiEvent,
  ContentBlockStopApiEvent,
  MessageDeltaApiEvent,
  MessageStopApiEvent,
)
export type ApiStreamEvent = typeof ApiStreamEvent.Type
```

- [ ] **Step 4: Run all events tests to verify they pass**

```bash
npm test -- src/services/claude-cli/__tests__/events.test.ts
```

Expected: PASS (all 12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/claude-cli/events.ts src/services/claude-cli/__tests__/events.test.ts
git commit -m "feat: add API streaming event types"
```

---

### Task 5: `events.ts` — CLI event union (`ClaudeEvent`)

**Files:**
- Modify: `src/services/claude-cli/events.ts` (append CLI events + `ClaudeEvent`)
- Modify: `src/services/claude-cli/__tests__/events.test.ts` (append tests)

- [ ] **Step 1: Write failing tests for CLI events**

Append to `src/services/claude-cli/__tests__/events.test.ts`:

```typescript
describe("ClaudeEvent union (CLI stream-json)", () => {
  it("decodes SystemInitEvent", async () => {
    const { ClaudeEvent } = await import("../events")
    const raw = { type: "system", subtype: "init", session_id: "sess_01", uuid: "uuid_01" }
    const result = await Effect.runPromise(Schema.decodeUnknown(ClaudeEvent)(raw))
    expect(result.type).toBe("system")
  })

  it("decodes SystemRetryEvent", async () => {
    const { ClaudeEvent } = await import("../events")
    const raw = {
      type: "system", subtype: "api_retry", attempt: 1, max_retries: 3,
      retry_delay_ms: 1000, error_status: 429, error: "rate limited",
      uuid: "uuid_01", session_id: "sess_01",
    }
    const result = await Effect.runPromise(Schema.decodeUnknown(ClaudeEvent)(raw))
    expect(result.type).toBe("system")
  })

  it("decodes AssistantMessageEvent", async () => {
    const { ClaudeEvent } = await import("../events")
    const raw = {
      type: "assistant",
      message: {
        id: "msg_01", type: "message", role: "assistant",
        content: [{ type: "text", text: "Hello!" }],
        model: "claude-opus-4-6", stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      uuid: "uuid_02", session_id: "sess_01",
    }
    const result = await Effect.runPromise(Schema.decodeUnknown(ClaudeEvent)(raw))
    expect(result.type).toBe("assistant")
  })

  it("decodes ResultEvent", async () => {
    const { ClaudeEvent } = await import("../events")
    const raw = {
      type: "result", subtype: "success", result: "Final answer",
      is_error: false, session_id: "sess_01", uuid: "uuid_03", total_cost_usd: 0.002,
    }
    const result = await Effect.runPromise(Schema.decodeUnknown(ClaudeEvent)(raw))
    expect(result.type).toBe("result")
  })

  it("decodes StreamEventMessage wrapping MessageStopApiEvent", async () => {
    const { ClaudeEvent } = await import("../events")
    const raw = {
      type: "stream_event", event: { type: "message_stop" },
      parent_tool_use_id: null, uuid: "uuid_01", session_id: "sess_01",
    }
    const result = await Effect.runPromise(Schema.decodeUnknown(ClaudeEvent)(raw))
    expect(result.type).toBe("stream_event")
  })

  it("UnknownEvent catches unrecognised types without error", async () => {
    const { ClaudeEvent } = await import("../events")
    const raw = { type: "user", session_id: "sess_01", uuid: "uuid_01", content: [] }
    const result = await Effect.runPromise(Schema.decodeUnknown(ClaudeEvent)(raw))
    expect(result.type).toBe("user")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/services/claude-cli/__tests__/events.test.ts
```

Expected: FAIL — `ClaudeEvent` not exported yet

- [ ] **Step 3: Append CLI event classes + `ClaudeEvent` union to `events.ts`**

```typescript
// Top-level CLI stream-json events
export class SystemInitEvent extends Schema.Class<SystemInitEvent>("SystemInitEvent")({
  type: Schema.Literal("system"),
  subtype: Schema.Literal("init"),
  session_id: Schema.String,
  uuid: Schema.String,
}) {}

export class SystemRetryEvent extends Schema.Class<SystemRetryEvent>("SystemRetryEvent")({
  type: Schema.Literal("system"),
  subtype: Schema.Literal("api_retry"),
  attempt: Schema.Number,
  max_retries: Schema.Number,
  retry_delay_ms: Schema.Number,
  error_status: Schema.NullOr(Schema.Number),
  error: Schema.String,
  uuid: Schema.String,
  session_id: Schema.String,
}) {}

export class StreamEventMessage extends Schema.Class<StreamEventMessage>("StreamEventMessage")({
  type: Schema.Literal("stream_event"),
  event: ApiStreamEvent,
  parent_tool_use_id: Schema.NullOr(Schema.String),
  uuid: Schema.String,
  session_id: Schema.String,
}) {}

export class AssistantMessageEvent extends Schema.Class<AssistantMessageEvent>("AssistantMessageEvent")({
  type: Schema.Literal("assistant"),
  message: Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("message"),
    role: Schema.Literal("assistant"),
    content: Schema.Array(ContentBlock),
    model: Schema.String,
    stop_reason: Schema.NullOr(Schema.String),
    stop_sequence: Schema.NullOr(Schema.String),
    usage: Usage,
  }),
  uuid: Schema.String,
  session_id: Schema.String,
}) {}

export class ResultEvent extends Schema.Class<ResultEvent>("ResultEvent")({
  type: Schema.Literal("result"),
  subtype: Schema.String,
  result: Schema.String,
  is_error: Schema.Boolean,
  session_id: Schema.String,
  uuid: Schema.String,
  total_cost_usd: Schema.optional(Schema.Number),
  usage: Schema.optional(Usage),
}) {}

// Catchall — must be last; catches anything not matched above (e.g. "user"/tool_result events)
export class UnknownEvent extends Schema.Class<UnknownEvent>("UnknownEvent")({
  type: Schema.String,
  session_id: Schema.optional(Schema.String),
  uuid: Schema.optional(Schema.String),
}) {}

export const ClaudeEvent = Schema.Union(
  SystemInitEvent,
  SystemRetryEvent,
  StreamEventMessage,
  AssistantMessageEvent,
  ResultEvent,
  UnknownEvent, // must be last
)
export type ClaudeEvent = typeof ClaudeEvent.Type
```

- [ ] **Step 4: Run all events tests**

```bash
npm test -- src/services/claude-cli/__tests__/events.test.ts
```

Expected: PASS (all 18 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/claude-cli/events.ts src/services/claude-cli/__tests__/events.test.ts
git commit -m "feat: add CLI event union (ClaudeEvent)"
```

---

### Task 6: `params.ts` and `service-definition.ts`

No tests needed — `params.test.ts` (Task 7) tests `buildArgs`, which indirectly validates the `QueryParams`/`ResumeParams`/`ContinueParams` field definitions; `service-definition.ts` contains no logic.

**Files:**
- Create: `src/services/claude-cli/params.ts`
- Create: `src/services/claude-cli/service-definition.ts`

- [ ] **Step 1: Create `src/services/claude-cli/params.ts`**

```typescript
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
```

- [ ] **Step 2: Create `src/services/claude-cli/service-definition.ts`**

```typescript
import { Context } from "effect"
import type { Stream } from "effect"
import type { ClaudeCliError } from "./errors"
import type { ClaudeEvent } from "./events"
import type { ContinueParams, QueryParams, ResumeParams } from "./params"

export class ClaudeCli extends Context.Tag("ClaudeCli")<
  ClaudeCli,
  {
    readonly query: (params: QueryParams) => Stream.Stream<ClaudeEvent, ClaudeCliError>
    readonly resume: (params: ResumeParams) => Stream.Stream<ClaudeEvent, ClaudeCliError>
    readonly continue_: (params: ContinueParams) => Stream.Stream<ClaudeEvent, ClaudeCliError>
  }
>() {}
```

- [ ] **Step 3: Typecheck**

(`typecheck` script already exists in `package.json` from project scaffolding)

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/services/claude-cli/params.ts src/services/claude-cli/service-definition.ts
git commit -m "feat: add QueryParams, ResumeParams, ContinueParams, and ClaudeCli service tag"
```

---

### Task 7: `service.ts` — `buildArgs` function + tests

**Files:**
- Create: `src/services/claude-cli/service.ts` (`buildArgs` only — `buildStream`/`ClaudeCliLive` added in Task 8)
- Create: `src/services/claude-cli/__tests__/params.test.ts`

- [ ] **Step 1: Write failing `buildArgs` tests**

Create `src/services/claude-cli/__tests__/params.test.ts`:

```typescript
import { describe, expect, it } from "vitest"

describe("buildArgs", () => {
  it("minimal: only prompt → base flags", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    expect(buildArgs(new QueryParams({ prompt: "Hello" }), [])).toEqual([
      "-p", "Hello", "--output-format", "stream-json",
    ])
  })

  it("extra args are appended after base flags", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi" }), ["--resume", "sess_01"])
    expect(args).toContain("--resume")
    expect(args).toContain("sess_01")
  })

  it("--model", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", model: "claude-opus-4-6" }), [])
    expect(args).toContain("--model")
    expect(args).toContain("claude-opus-4-6")
  })

  it("--append-system-prompt", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", append_system_prompt: "Be brief" }), [])
    expect(args).toContain("--append-system-prompt")
    expect(args).toContain("Be brief")
  })

  it("--allowedTools (variadic)", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", allowed_tools: ["Read", "Write"] }), [])
    const idx = args.indexOf("--allowedTools")
    expect(idx).toBeGreaterThan(-1)
    expect(args[idx + 1]).toBe("Read")
    expect(args[idx + 2]).toBe("Write")
  })

  it("--max-turns", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_turns: 5 }), [])
    expect(args).toContain("--max-turns")
    expect(args).toContain("5")
  })

  it("--max-budget-usd", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", max_budget_usd: 0.5 }), [])
    expect(args).toContain("--max-budget-usd")
    expect(args).toContain("0.5")
  })

  it("--bare when true", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    expect(buildArgs(new QueryParams({ prompt: "Hi", bare: true }), [])).toContain("--bare")
  })

  it("no --bare when false", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    expect(buildArgs(new QueryParams({ prompt: "Hi", bare: false }), [])).not.toContain("--bare")
  })

  it("--session-id", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", session_id: "sess_01" }), [])
    expect(args).toContain("--session-id")
    expect(args).toContain("sess_01")
  })

  it("--name", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", name: "my-session" }), [])
    expect(args).toContain("--name")
    expect(args).toContain("my-session")
  })

  it("--verbose and --include-partial-messages together", async () => {
    const { buildArgs } = await import("../service")
    const { QueryParams } = await import("../params")
    const args = buildArgs(new QueryParams({ prompt: "Hi", include_partial_messages: true }), [])
    expect(args).toContain("--verbose")
    expect(args).toContain("--include-partial-messages")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/services/claude-cli/__tests__/params.test.ts
```

Expected: FAIL — "Cannot find module '../service'"

- [ ] **Step 3: Create `src/services/claude-cli/service.ts` with `buildArgs` only**

```typescript
import { Command, CommandExecutor } from "@effect/platform"
import { Effect, Fiber, Layer, Schema, Stream } from "effect"
import { ClaudeCliParseError, ClaudeCliProcessError, ClaudeCliSpawnError } from "./errors"
import { ClaudeEvent } from "./events"
import type { ContinueParams, ResumeParams } from "./params"
import { QueryParams } from "./params"
import { ClaudeCli } from "./service-definition"

export const buildArgs = (params: QueryParams, extra: readonly string[]): string[] => {
  const args = ["-p", params.prompt, "--output-format", "stream-json", ...extra]
  if (params.model) args.push("--model", params.model)
  if (params.append_system_prompt) args.push("--append-system-prompt", params.append_system_prompt)
  if (params.allowed_tools?.length) args.push("--allowedTools", ...params.allowed_tools)
  if (params.max_turns !== undefined) args.push("--max-turns", String(params.max_turns))
  if (params.max_budget_usd !== undefined) args.push("--max-budget-usd", String(params.max_budget_usd))
  if (params.bare) args.push("--bare")
  if (params.session_id) args.push("--session-id", params.session_id)
  if (params.name) args.push("--name", params.name)
  if (params.include_partial_messages) args.push("--verbose", "--include-partial-messages")
  return args
}
```

(Leave room below `buildArgs` for `buildStream` and `ClaudeCliLive` in Task 8.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/services/claude-cli/__tests__/params.test.ts
```

Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/claude-cli/service.ts src/services/claude-cli/__tests__/params.test.ts
git commit -m "feat: add buildArgs with arg-building tests"
```

---

### Task 8: `service.ts` — `buildStream` + `ClaudeCliLive` + stream pipeline tests

> Reference: @effect-ts skill — `Layer.effect`, `Stream.unwrapScoped`, `Effect.fork`, `Fiber.join`

**Files:**
- Modify: `src/services/claude-cli/service.ts` (append `buildStream` + `ClaudeCliLive`)
- Create: `src/services/claude-cli/__tests__/service.test.ts`

- [ ] **Step 1: Write failing stream pipeline tests**

Create `src/services/claude-cli/__tests__/service.test.ts`:

```typescript
import { CommandExecutor } from "@effect/platform"
import { Chunk, Effect, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { ClaudeCliParseError, ClaudeCliProcessError } from "../errors"
import type { ResultEvent, SystemInitEvent } from "../events"
import { QueryParams } from "../params"
import { ClaudeCli } from "../service-definition"

// Encode newline-delimited JSON lines as UTF-8 bytes for mocking stdout
const encodeLines = (...lines: string[]): Uint8Array =>
  new TextEncoder().encode(`${lines.join("\n")}\n`)

// Minimal mock process — only the fields buildStream uses
const makeMockProcess = (stdoutBytes: Uint8Array, exitCode: number, stderrText = "") =>
  ({
    stdout: Stream.make(stdoutBytes),
    stderr: Stream.make(new TextEncoder().encode(stderrText)),
    exitCode: Effect.succeed(exitCode),
  }) as any

// Provide a mock CommandExecutor that returns a specific process
const makeExecutorLayer = (process: ReturnType<typeof makeMockProcess>) =>
  Layer.succeed(CommandExecutor, { start: () => Effect.succeed(process) } as any)

// Real CLI output fixtures
const INIT_LINE = JSON.stringify({ type: "system", subtype: "init", session_id: "sess_01", uuid: "uuid_01" })
const ASSISTANT_LINE = JSON.stringify({
  type: "assistant",
  message: {
    id: "msg_01", type: "message", role: "assistant",
    content: [{ type: "text", text: "Hello!" }],
    model: "claude-opus-4-6", stop_reason: "end_turn", stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  },
  uuid: "uuid_02", session_id: "sess_01",
})
const RESULT_LINE = JSON.stringify({
  type: "result", subtype: "success", result: "Hello!", is_error: false,
  session_id: "sess_01", uuid: "uuid_03", total_cost_usd: 0.001,
})

describe("ClaudeCli stream pipeline", () => {
  it("query() emits SystemInitEvent → AssistantMessageEvent → ResultEvent on success", async () => {
    const { ClaudeCliLive } = await import("../service")
    const mockProcess = makeMockProcess(encodeLines(INIT_LINE, ASSISTANT_LINE, RESULT_LINE), 0)
    const testLayer = ClaudeCliLive.pipe(Layer.provide(makeExecutorLayer(mockProcess)))

    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const cli = yield* ClaudeCli
        return yield* Stream.runCollect(cli.query(new QueryParams({ prompt: "Hi" })))
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    )

    const arr = Chunk.toArray(events)
    expect(arr).toHaveLength(3)
    expect(arr[0].type).toBe("system")
    expect((arr[0] as SystemInitEvent).subtype).toBe("init")
    expect(arr[1].type).toBe("assistant")
    expect(arr[2].type).toBe("result")
    expect((arr[2] as ResultEvent).is_error).toBe(false)
  })

  it("query() fails with ClaudeCliProcessError on non-zero exit", async () => {
    const { ClaudeCliLive } = await import("../service")
    const mockProcess = makeMockProcess(new Uint8Array(), 1, "Fatal error")
    const testLayer = ClaudeCliLive.pipe(Layer.provide(makeExecutorLayer(mockProcess)))

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const cli = yield* ClaudeCli
        return yield* Stream.runCollect(cli.query(new QueryParams({ prompt: "Hi" }))).pipe(Effect.either)
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    )

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ClaudeCliProcessError)
      expect((result.left as ClaudeCliProcessError).exitCode).toBe(1)
      expect((result.left as ClaudeCliProcessError).stderr).toBe("Fatal error")
    }
  })

  it("query() fails with ClaudeCliParseError on malformed JSON", async () => {
    const { ClaudeCliLive } = await import("../service")
    const mockProcess = makeMockProcess(encodeLines("NOT JSON"), 0)
    const testLayer = ClaudeCliLive.pipe(Layer.provide(makeExecutorLayer(mockProcess)))

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const cli = yield* ClaudeCli
        return yield* Stream.runCollect(cli.query(new QueryParams({ prompt: "Hi" }))).pipe(Effect.either)
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    )

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ClaudeCliParseError)
      expect((result.left as ClaudeCliParseError).raw).toBe("NOT JSON")
    }
  })

  it("empty lines in stdout are ignored", async () => {
    const { ClaudeCliLive } = await import("../service")
    const withBlanks = encodeLines("", INIT_LINE, "", RESULT_LINE, "")
    const mockProcess = makeMockProcess(withBlanks, 0)
    const testLayer = ClaudeCliLive.pipe(Layer.provide(makeExecutorLayer(mockProcess)))

    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const cli = yield* ClaudeCli
        return yield* Stream.runCollect(cli.query(new QueryParams({ prompt: "Hi" })))
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    )

    expect(Chunk.size(events)).toBe(2)
  })

  it("resume() appends --resume and session_id to args", async () => {
    const { buildArgs } = await import("../service")
    const { ResumeParams } = await import("../params")
    const params = new ResumeParams({ prompt: "Hi", session_id: "sess_01" })
    const args = buildArgs(params, ["--resume", params.session_id])
    expect(args).toContain("--resume")
    expect(args).toContain("sess_01")
  })

  it("resume() with fork appends --fork-session", async () => {
    const { buildArgs } = await import("../service")
    const { ResumeParams } = await import("../params")
    const params = new ResumeParams({ prompt: "Hi", session_id: "sess_01", fork: true })
    const args = buildArgs(params, ["--resume", params.session_id, "--fork-session"])
    expect(args).toContain("--fork-session")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/services/claude-cli/__tests__/service.test.ts
```

Expected: FAIL — `ClaudeCliLive` not exported yet

- [ ] **Step 3: Append `buildStream` and `ClaudeCliLive` to `service.ts`**

Append below `buildArgs` in `src/services/claude-cli/service.ts`:

```typescript
const buildStream = (
  params: QueryParams,
  extraArgs: readonly string[],
): Stream.Stream<ClaudeEvent, ClaudeCliError, CommandExecutor> => {
  const args = buildArgs(params, extraArgs)
  let command = Command.make("claude", ...args)
  if (params.cwd) command = Command.workingDirectory(command, params.cwd)

  return Stream.unwrapScoped(
    Effect.gen(function* () {
      const process = yield* Command.start(command).pipe(
        Effect.mapError((cause) => new ClaudeCliSpawnError({ message: String(cause), cause })),
      )

      // Collect stderr concurrently so it's available when we check the exit code
      const stderrFiber = yield* process.stderr.pipe(
        Stream.decodeText(),
        Stream.runFold("", (acc, s) => acc + s),
        Effect.fork,
      )

      // After stdout drains, verify exit code; fail stream if non-zero
      const checkExit = Effect.gen(function* () {
        const exitCode = yield* process.exitCode.pipe(
          Effect.mapError((cause) => new ClaudeCliSpawnError({ message: "Failed to get process exit code", cause })),
        )
        if (exitCode !== 0) {
          const stderr = yield* Fiber.join(stderrFiber)
          yield* Effect.fail(new ClaudeCliProcessError({ exitCode, stderr }))
        }
      })

      const eventStream = process.stdout.pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.filter((line) => line.trim().length > 0),
        Stream.mapEffect((line) =>
          Effect.try({
            try: () => JSON.parse(line),
            catch: (e) => new ClaudeCliParseError({ raw: line, cause: e }),
          }).pipe(
            Effect.flatMap((json) =>
              Schema.decodeUnknown(ClaudeEvent)(json).pipe(
                Effect.mapError((cause) => new ClaudeCliParseError({ raw: line, cause })),
              ),
            ),
          ),
        ),
        // Stream.concat runs checkExit after stdout drains and propagates any ClaudeCliError
        Stream.concat(Stream.fromEffect(checkExit).pipe(Stream.drain)),
      )

      return eventStream
    }),
  )
}

// Note: the spec uses Layer.succeed here. This plan intentionally uses Layer.effect instead,
// so CommandExecutor is captured once at build time and provided to each stream via
// Stream.provideService — keeping the service interface's R type = never (self-contained streams).
// Layer.succeed would leave CommandExecutor in R, requiring callers to thread it through.
export const ClaudeCliLive = Layer.effect(
  ClaudeCli,
  Effect.gen(function* () {
    const executor = yield* CommandExecutor
    const provide = <A, E>(stream: Stream.Stream<A, E, CommandExecutor>) =>
      stream.pipe(Stream.provideService(CommandExecutor, executor))

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
  }),
)
```

- [ ] **Step 4: Run the service tests**

```bash
npm test -- src/services/claude-cli/__tests__/service.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: PASS (all tests across all 4 test files)

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no type errors

- [ ] **Step 7: Commit**

```bash
git add src/services/claude-cli/service.ts src/services/claude-cli/__tests__/service.test.ts
git commit -m "feat: implement ClaudeCliLive with buildStream, stream pipeline, and tests"
```

---

## Consumer Usage Example

```typescript
// Main process entry point
import { NodeContext } from "@effect/platform-node"
import { Console, Effect, Stream } from "effect"
import { ClaudeCliLive } from "@/services/claude-cli/service"
import { ClaudeCli } from "@/services/claude-cli/service-definition"
import { QueryParams } from "@/services/claude-cli/params"

const program = Effect.gen(function* () {
  const cli = yield* ClaudeCli
  const events = cli.query(new QueryParams({ prompt: "Hello", bare: true }))
  yield* Stream.runForEach(events, (event) =>
    Console.log(event.type, "session:", event.session_id)
  )
})

program.pipe(
  Effect.provide(ClaudeCliLive),
  Effect.provide(NodeContext.layer),
  Effect.scoped,
  Effect.runPromise,
)
```

`ClaudeCliLive` requires `CommandExecutor`, provided by `NodeContext.layer` from `@effect/platform-node`.
