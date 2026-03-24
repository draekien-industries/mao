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
  // params.cwd is NOT a CLI flag — handled via Command.workingDirectory in buildStream
  return args
}

const buildStream = (
  params: QueryParams,
  extraArgs: readonly string[],
): Stream.Stream<ClaudeEvent, ClaudeCliSpawnError | ClaudeCliParseError | ClaudeCliProcessError, CommandExecutor.CommandExecutor> => {
  const args = buildArgs(params, extraArgs)
  let command = Command.make("claude", ...args)
  if (params.cwd) command = Command.workingDirectory(command, params.cwd)

  return Stream.unwrapScoped(
    Effect.gen(function* () {
      const process = yield* Command.start(command).pipe(
        Effect.mapError((cause) => new ClaudeCliSpawnError({ message: String(cause), cause })),
      )

      // Collect stderr concurrently; forkScoped ties the fiber lifetime to the stream scope
      const stderrFiber = yield* process.stderr.pipe(
        Stream.decodeText(),
        Stream.runFold("", (acc, s) => acc + s),
        Effect.mapError((cause) => new ClaudeCliSpawnError({ message: String(cause), cause })),
        Effect.forkScoped,
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
        Stream.mapError((cause) => new ClaudeCliSpawnError({ message: String(cause), cause })),
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
export const ClaudeCliLive = Layer.effect(
  ClaudeCli,
  Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor
    const provide = <A, E>(stream: Stream.Stream<A, E, CommandExecutor.CommandExecutor>) =>
      stream.pipe(Stream.provideService(CommandExecutor.CommandExecutor, executor))

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
