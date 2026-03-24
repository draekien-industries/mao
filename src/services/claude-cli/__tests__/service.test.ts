import { CommandExecutor } from "@effect/platform";
import { Chunk, Effect, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { ClaudeCliParseError, ClaudeCliProcessError } from "../errors";
import type { ResultEvent, SystemInitEvent } from "../events";
import { QueryParams } from "../params";
import { ClaudeCli } from "../service-definition";

// Encode newline-delimited JSON lines as UTF-8 bytes for mocking stdout
const encodeLines = (...lines: string[]): Uint8Array =>
  new TextEncoder().encode(`${lines.join("\n")}\n`);

// Minimal mock process — only the fields buildStream uses
const makeMockProcess = (
  stdoutBytes: Uint8Array,
  exitCode: number,
  stderrText = "",
) =>
  ({
    stdout: Stream.make(stdoutBytes),
    stderr: Stream.make(new TextEncoder().encode(stderrText)),
    exitCode: Effect.succeed(exitCode),
  }) as any;

// Provide a mock CommandExecutor that returns a specific process
const makeExecutorLayer = (process: ReturnType<typeof makeMockProcess>) =>
  Layer.succeed(CommandExecutor.CommandExecutor, {
    start: () => Effect.succeed(process),
  } as any);

// Real CLI output fixtures
const INIT_LINE = JSON.stringify({
  type: "system",
  subtype: "init",
  session_id: "sess_01",
  uuid: "uuid_01",
});
const ASSISTANT_LINE = JSON.stringify({
  type: "assistant",
  message: {
    id: "msg_01",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "Hello!" }],
    model: "claude-opus-4-6",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  },
  uuid: "uuid_02",
  session_id: "sess_01",
});
const RESULT_LINE = JSON.stringify({
  type: "result",
  subtype: "success",
  result: "Hello!",
  is_error: false,
  session_id: "sess_01",
  uuid: "uuid_03",
  total_cost_usd: 0.001,
});

describe("ClaudeCli stream pipeline", () => {
  it("query() emits SystemInitEvent → AssistantMessageEvent → ResultEvent on success", async () => {
    const { ClaudeCliLive } = await import("../service");
    const mockProcess = makeMockProcess(
      encodeLines(INIT_LINE, ASSISTANT_LINE, RESULT_LINE),
      0,
    );
    const testLayer = ClaudeCliLive.pipe(
      Layer.provide(makeExecutorLayer(mockProcess)),
    );

    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const cli = yield* ClaudeCli;
        return yield* Stream.runCollect(
          cli.query(new QueryParams({ prompt: "Hi" })),
        );
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    );

    const arr = Chunk.toArray(events);
    expect(arr).toHaveLength(3);
    expect(arr[0].type).toBe("system");
    expect((arr[0] as SystemInitEvent).subtype).toBe("init");
    expect(arr[1].type).toBe("assistant");
    expect(arr[2].type).toBe("result");
    expect((arr[2] as ResultEvent).is_error).toBe(false);
  });

  it("query() fails with ClaudeCliProcessError on non-zero exit", async () => {
    const { ClaudeCliLive } = await import("../service");
    const mockProcess = makeMockProcess(new Uint8Array(), 1, "Fatal error");
    const testLayer = ClaudeCliLive.pipe(
      Layer.provide(makeExecutorLayer(mockProcess)),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const cli = yield* ClaudeCli;
        return yield* Stream.runCollect(
          cli.query(new QueryParams({ prompt: "Hi" })),
        ).pipe(Effect.either);
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ClaudeCliProcessError);
      expect((result.left as ClaudeCliProcessError).exitCode).toBe(1);
      expect((result.left as ClaudeCliProcessError).stderr).toBe("Fatal error");
    }
  });

  it("query() fails with ClaudeCliParseError on malformed JSON", async () => {
    const { ClaudeCliLive } = await import("../service");
    const mockProcess = makeMockProcess(encodeLines("NOT JSON"), 0);
    const testLayer = ClaudeCliLive.pipe(
      Layer.provide(makeExecutorLayer(mockProcess)),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const cli = yield* ClaudeCli;
        return yield* Stream.runCollect(
          cli.query(new QueryParams({ prompt: "Hi" })),
        ).pipe(Effect.either);
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ClaudeCliParseError);
      expect((result.left as ClaudeCliParseError).raw).toBe("NOT JSON");
    }
  });

  it("empty lines in stdout are ignored", async () => {
    const { ClaudeCliLive } = await import("../service");
    const withBlanks = encodeLines("", INIT_LINE, "", RESULT_LINE, "");
    const mockProcess = makeMockProcess(withBlanks, 0);
    const testLayer = ClaudeCliLive.pipe(
      Layer.provide(makeExecutorLayer(mockProcess)),
    );

    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const cli = yield* ClaudeCli;
        return yield* Stream.runCollect(
          cli.query(new QueryParams({ prompt: "Hi" })),
        );
      }).pipe(Effect.provide(testLayer), Effect.scoped),
    );

    expect(Chunk.size(events)).toBe(2);
  });
});
