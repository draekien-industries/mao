# Claude Code CLI Wrapper — Design Spec

## Overview

An Effect.js wrapper around the `claude` CLI binary for use in the Electron main process. Spawns `claude -p --output-format stream-json` as a child process via `@effect/platform`'s Command module, parses the newline-delimited JSON output into typed Effect Streams, and exposes operations through an Effect Service + Layer.

## Decisions

- **CLI binary wrapping** (not `@anthropic-ai/claude-agent-sdk`) — process isolation, full CLI environment (hooks, plugins, MCP, CLAUDE.md)
- **`@effect/platform` Command module** — canonical Effect process management with native Stream integration, resource-safe lifecycle via Scope, testable via CommandExecutor layer swap
- **Full Effect idioms** — Services + Layers, Schema for all types (params and events), TaggedError for structured errors
- **snake_case preserved** — event Schema types match CLI JSON output keys exactly (`session_id`, `parent_tool_use_id`)
- **Full API event typing** — all 6 Claude API streaming event types fully typed with Schema unions
- **Initial scope** — query (`claude -p`) and session management (continue, resume, fork)
- **No barrel file** — consumers import directly from `service-definition.ts`, `service.ts`, `params.ts`, `events.ts`, or `errors.ts`
- **kebab-case filenames** — all files use kebab-case
- **`append_system_prompt` (not `system_prompt`)** — param name matches `--append-system-prompt` CLI flag semantics exactly
- **`include_partial_messages` param** — opt-in; when true, also passes `--verbose` (required by the CLI to emit `stream_event` lines)
- **`UnknownEvent` catchall** — keeps the Schema union open; unknown event types (e.g. `user`/tool_result) are captured rather than causing parse errors

## File Structure

```
src/services/claude-cli/
├── service-definition.ts        # Service tag definition (Context.Tag)
├── service.ts                   # Live layer (Command spawning + stream pipeline)
├── errors.ts                    # Structured error types
├── params.ts                    # Schema classes for operation params
└── events.ts                    # Schema classes for CLI stream-json events + API streaming events
```

No barrel `index.ts` — consumers import directly from the file they need.

## Dependencies to Add

- `effect` — core library
- `@effect/platform` — Command, Stream utilities, CommandExecutor
- `@effect/platform-node` — NodeContext.layer providing Node.js CommandExecutor

## Service Interface

```typescript
// service-definition.ts
class ClaudeCli extends Context.Tag("ClaudeCli")<ClaudeCli, {
  readonly query: (params: QueryParams) => Stream.Stream<ClaudeEvent, ClaudeCliError>
  readonly resume: (params: ResumeParams) => Stream.Stream<ClaudeEvent, ClaudeCliError>
  readonly continue_: (params: ContinueParams) => Stream.Stream<ClaudeEvent, ClaudeCliError>
}>() {}
```

All operations return `Stream.Stream<ClaudeEvent, ClaudeCliError>` — a typed, lazy stream of decoded events from the CLI's stream-json output.

## Error Types

```typescript
// errors.ts
class ClaudeCliSpawnError extends Schema.TaggedError<ClaudeCliSpawnError>()(
  "ClaudeCliSpawnError", { message: Schema.String, cause: Schema.Unknown }
) {}

class ClaudeCliParseError extends Schema.TaggedError<ClaudeCliParseError>()(
  "ClaudeCliParseError", { raw: Schema.String, cause: Schema.Unknown }
) {}

class ClaudeCliProcessError extends Schema.TaggedError<ClaudeCliProcessError>()(
  "ClaudeCliProcessError", { exitCode: Schema.Number, stderr: Schema.String }
) {}

type ClaudeCliError = ClaudeCliSpawnError | ClaudeCliParseError | ClaudeCliProcessError
```

- `ClaudeCliSpawnError` — failed to spawn the `claude` process (not found, permission denied); preserves the underlying `PlatformError` as `cause`
- `ClaudeCliParseError` — a line from stream-json couldn't be parsed/decoded
- `ClaudeCliProcessError` — process exited with non-zero exit code

## Param Types (Schema Classes)

```typescript
// params.ts
class QueryParams extends Schema.Class<QueryParams>("QueryParams")({
  prompt: Schema.String,
  model: Schema.optional(Schema.String),
  append_system_prompt: Schema.optional(Schema.String), // maps to --append-system-prompt
  allowed_tools: Schema.optional(Schema.Array(Schema.String)),
  max_turns: Schema.optional(Schema.Number),
  max_budget_usd: Schema.optional(Schema.Number),
  bare: Schema.optional(Schema.Boolean),
  include_partial_messages: Schema.optional(Schema.Boolean), // maps to --include-partial-messages (requires --verbose)
  session_id: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
}) {}

// Note: ResumeParams spreads QueryParams.fields and overrides session_id as required.
// Schema.Class.fields spread is valid in Effect v3 but the override is intentional —
// QueryParams has session_id as optional, ResumeParams requires it.
class ResumeParams extends Schema.Class<ResumeParams>("ResumeParams")({
  ...QueryParams.fields,
  session_id: Schema.String, // required — the session to resume
  fork: Schema.optional(Schema.Boolean),
}) {}

class ContinueParams extends Schema.Class<ContinueParams>("ContinueParams")({
  ...QueryParams.fields,
}) {}
```

**Note on streaming events:** `StreamEventMessage` (the `stream_event` CLI output type) only appears in stream-json output when both `--verbose` and `--include-partial-messages` are passed. Without them, only `assistant` and `result` events are emitted. Set `include_partial_messages: true` in `QueryParams` to receive text deltas and tool-use events in real time.

## Event Types (Schema Classes)

All event types live in `events.ts`. Declaration order matters — nested types must be defined before they are referenced.

### 1. Shared primitives

```typescript
// events.ts

// Token usage counts (shared by multiple event types)
class Usage extends Schema.Class<Usage>("Usage")({
  input_tokens: Schema.optional(Schema.Number),
  output_tokens: Schema.optional(Schema.Number),
  cache_creation_input_tokens: Schema.optional(Schema.Number),
  cache_read_input_tokens: Schema.optional(Schema.Number),
}) {}

// Content block variants (text or tool use)
class TextBlock extends Schema.Class<TextBlock>("TextBlock")({
  type: Schema.Literal("text"),
  text: Schema.String,
}) {}

class ToolUseBlock extends Schema.Class<ToolUseBlock>("ToolUseBlock")({
  type: Schema.Literal("tool_use"),
  id: Schema.String,
  name: Schema.String,
  input: Schema.Unknown, // varies by tool
}) {}

const ContentBlock = Schema.Union(TextBlock, ToolUseBlock)

// Delta variants for streaming content
class TextDelta extends Schema.Class<TextDelta>("TextDelta")({
  type: Schema.Literal("text_delta"),
  text: Schema.String,
}) {}

class InputJsonDelta extends Schema.Class<InputJsonDelta>("InputJsonDelta")({
  type: Schema.Literal("input_json_delta"),
  partial_json: Schema.String,
}) {}

const ContentDelta = Schema.Union(TextDelta, InputJsonDelta)
```

### 2. API streaming events (inside `StreamEventMessage.event`)

```typescript
// events.ts (continued)

class MessageStartApiEvent extends Schema.Class<MessageStartApiEvent>("MessageStartApiEvent")({
  type: Schema.Literal("message_start"),
  message: Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("message"),
    role: Schema.Literal("assistant"),
    content: Schema.Array(Schema.Unknown), // empty at message_start
    model: Schema.String,
    stop_reason: Schema.NullOr(Schema.String),
    stop_sequence: Schema.NullOr(Schema.String),
    usage: Usage,
  }),
}) {}

class ContentBlockStartApiEvent extends Schema.Class<ContentBlockStartApiEvent>("ContentBlockStartApiEvent")({
  type: Schema.Literal("content_block_start"),
  index: Schema.Number,
  content_block: ContentBlock,
}) {}

class ContentBlockDeltaApiEvent extends Schema.Class<ContentBlockDeltaApiEvent>("ContentBlockDeltaApiEvent")({
  type: Schema.Literal("content_block_delta"),
  index: Schema.Number,
  delta: ContentDelta,
}) {}

class ContentBlockStopApiEvent extends Schema.Class<ContentBlockStopApiEvent>("ContentBlockStopApiEvent")({
  type: Schema.Literal("content_block_stop"),
  index: Schema.Number,
}) {}

class MessageDeltaApiEvent extends Schema.Class<MessageDeltaApiEvent>("MessageDeltaApiEvent")({
  type: Schema.Literal("message_delta"),
  delta: Schema.Struct({
    stop_reason: Schema.NullOr(Schema.String),
    stop_sequence: Schema.NullOr(Schema.String),
  }),
  usage: Schema.Struct({ output_tokens: Schema.Number }),
}) {}

class MessageStopApiEvent extends Schema.Class<MessageStopApiEvent>("MessageStopApiEvent")({
  type: Schema.Literal("message_stop"),
}) {}

const ApiStreamEvent = Schema.Union(
  MessageStartApiEvent,
  ContentBlockStartApiEvent,
  ContentBlockDeltaApiEvent,
  ContentBlockStopApiEvent,
  MessageDeltaApiEvent,
  MessageStopApiEvent,
)
type ApiStreamEvent = typeof ApiStreamEvent.Type
```

### 3. Top-level CLI events

Each line from `--output-format stream-json` decodes to one of these:

```typescript
// events.ts (continued)

class SystemInitEvent extends Schema.Class<SystemInitEvent>("SystemInitEvent")({
  type: Schema.Literal("system"),
  subtype: Schema.Literal("init"),
  session_id: Schema.String,
  uuid: Schema.String,
}) {}

class SystemRetryEvent extends Schema.Class<SystemRetryEvent>("SystemRetryEvent")({
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

class StreamEventMessage extends Schema.Class<StreamEventMessage>("StreamEventMessage")({
  type: Schema.Literal("stream_event"),
  event: ApiStreamEvent,
  parent_tool_use_id: Schema.NullOr(Schema.String),
  uuid: Schema.String,
  session_id: Schema.String,
}) {}

class AssistantMessageEvent extends Schema.Class<AssistantMessageEvent>("AssistantMessageEvent")({
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

class ResultEvent extends Schema.Class<ResultEvent>("ResultEvent")({
  type: Schema.Literal("result"),
  subtype: Schema.String,           // "success" | "error_max_turns" | etc.
  result: Schema.String,
  is_error: Schema.Boolean,
  session_id: Schema.String,
  uuid: Schema.String,
  total_cost_usd: Schema.optional(Schema.Number),
  usage: Schema.optional(Usage),
}) {}

// Catchall — keeps the union open for unmodelled types (e.g. "user"/tool_result events)
class UnknownEvent extends Schema.Class<UnknownEvent>("UnknownEvent")({
  type: Schema.String,
  session_id: Schema.optional(Schema.String),
  uuid: Schema.optional(Schema.String),
}) {}

const ClaudeEvent = Schema.Union(
  SystemInitEvent,
  SystemRetryEvent,
  StreamEventMessage,
  AssistantMessageEvent,
  ResultEvent,
  UnknownEvent,  // must be last — catches anything not matched above
)
type ClaudeEvent = typeof ClaudeEvent.Type
```

**Out of scope:** `user`/tool_result events may appear in multi-turn stream output but are not needed for the initial scope. They are caught by `UnknownEvent`.

## Stream Pipeline (ClaudeCliLive)

The core implementation transforms CLI stdout into typed events:

```
CLI stdout (Uint8Array)
  → Stream.decodeText()
  → split by "\n"
  → filter empty lines
  → JSON.parse each line
  → Schema.decodeUnknown(ClaudeEvent)
  → Stream<ClaudeEvent, ClaudeCliError>
```

```typescript
// service.ts

const buildArgs = (params: QueryParams, extra: readonly string[]): string[] => {
  const args = ["-p", params.prompt, "--output-format", "stream-json", ...extra]
  if (params.model) args.push("--model", params.model)
  if (params.append_system_prompt) args.push("--append-system-prompt", params.append_system_prompt)
  if (params.allowed_tools?.length) args.push("--allowedTools", ...params.allowed_tools) // variadic: CLI accepts multiple tool args
  if (params.max_turns !== undefined) args.push("--max-turns", String(params.max_turns))
  if (params.max_budget_usd !== undefined) args.push("--max-budget-usd", String(params.max_budget_usd))
  if (params.bare) args.push("--bare")
  if (params.session_id) args.push("--session-id", params.session_id)
  if (params.name) args.push("--name", params.name)
  // --include-partial-messages requires --verbose to emit stream_event lines
  if (params.include_partial_messages) args.push("--verbose", "--include-partial-messages")
  return args
}

const buildStream = (params: QueryParams, extraArgs: readonly string[]) => {
  const args = buildArgs(params, extraArgs)
  let command = Command.make("claude", ...args)
  if (params.cwd) command = Command.workingDirectory(command, params.cwd)

  return Stream.unwrapScoped(
    Effect.gen(function* () {
      const process = yield* Command.start(command).pipe(
        Effect.mapError((cause) => new ClaudeCliSpawnError({ message: String(cause), cause }))
      )

      // Collect stderr concurrently so it's available when we check exit code
      const stderrFiber = yield* process.stderr.pipe(
        Stream.decodeText(),
        Stream.runFold("", (acc, s) => acc + s),
        Effect.fork,
      )

      // After the stdout stream drains, check exit code.
      // process.exitCode has type Effect<ExitCode, PlatformError> — map PlatformError
      // to ClaudeCliSpawnError (failure to interact with the process, not a normal exit).
      // checkExit can fail with ClaudeCliError, so we use Stream.concat (not
      // Stream.ensuring, which requires a never error channel).
      const checkExit = Effect.gen(function* () {
        const exitCode = yield* process.exitCode.pipe(
          Effect.mapError((cause) => new ClaudeCliSpawnError({ message: "Failed to get process exit code", cause }))
        )
        if (exitCode !== 0) {
          const stderr = yield* Fiber.join(stderrFiber)
          yield* Effect.fail(new ClaudeCliProcessError({ exitCode, stderr }))
        }
      })

      const eventStream = process.stdout.pipe(
        Stream.decodeText(),
        Stream.splitLines,            // built-in Effect operator — handles partial lines and \r\n
        Stream.filter((line) => line.trim().length > 0),
        Stream.mapEffect((line) =>
          Effect.try({
            try: () => JSON.parse(line),
            catch: (e) => new ClaudeCliParseError({ raw: line, cause: e }),
          }).pipe(
            Effect.flatMap((json) =>
              Schema.decodeUnknown(ClaudeEvent)(json).pipe(
                Effect.mapError((cause) => new ClaudeCliParseError({ raw: line, cause }))
              )
            )
          )
        ),
        // Stream.concat runs checkExit after stdout drains — propagates ClaudeCliError naturally.
        // Stream.ensuring is NOT used here as it requires a never error channel.
        Stream.concat(Stream.fromEffect(checkExit).pipe(Stream.drain)),
      )

      return eventStream
    })
  )
}

// Layer.succeed — no initialization effects needed
const ClaudeCliLive = Layer.succeed(ClaudeCli, {
  query: (params) => buildStream(params, []),
  resume: (params) => buildStream(
    params,
    ["--resume", params.session_id, ...(params.fork ? ["--fork-session"] : [])],
  ),
  continue_: (params) => buildStream(params, ["--continue"]),
})
```

## Layer Composition

```typescript
// Consumer usage — import directly from file, no barrel:
// import { ClaudeCli } from "@/services/claude-cli/service-definition"
// import { ClaudeCliLive } from "@/services/claude-cli/service"
// import { QueryParams } from "@/services/claude-cli/params"

const program = Effect.gen(function* () {
  const cli = yield* ClaudeCli
  const events = cli.query(new QueryParams({ prompt: "Hello", bare: true }))
  yield* Stream.runForEach(events, (event) =>
    Console.log(event._tag, event.session_id)
  )
})

program.pipe(
  Effect.provide(ClaudeCliLive),
  Effect.provide(NodeContext.layer),
  Effect.scoped,
)
```

`ClaudeCliLive` depends on `CommandExecutor` (from `@effect/platform`), provided by `NodeContext.layer` (from `@effect/platform-node`).

## Testing Strategy

- **Stream pipeline unit tests** — mock CommandExecutor to emit raw newline-delimited JSON, verify decoded ClaudeEvent values
- **Arg building tests** — verify QueryParams/ResumeParams/ContinueParams → CLI arg array translation
- **Schema tests** — feed real CLI output samples through Schema.decodeUnknown to verify the union decodes correctly
- **Error path tests** — verify spawn failures, malformed JSON lines, and non-zero exit codes produce the correct error types
