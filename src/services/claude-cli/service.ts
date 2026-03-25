import { Command, CommandExecutor } from "@effect/platform";
import { Effect, Fiber, Layer, Schema, Stream } from "effect";
import { annotations } from "../diagnostics";
import {
  ClaudeCliParseError,
  ClaudeCliProcessError,
  ClaudeCliSpawnError,
} from "./errors";
import { ClaudeEvent } from "./events";
import {
  ContinueParams,
  type FlagDef,
  QueryParams,
  ResumeParams,
} from "./params";
import { ClaudeCli } from "./service-definition";

type ParamClass = {
  readonly flagMap: Record<string, FlagDef>;
  readonly commandFlags: readonly string[];
};

export const buildArgs = (
  params: QueryParams | ResumeParams | ContinueParams,
  ParamType: ParamClass,
): string[] => {
  const args: string[] = [...ParamType.commandFlags];
  const values: Record<string, unknown> = { ...params };

  for (const [field, def] of Object.entries(ParamType.flagMap)) {
    const value = values[field];

    switch (def.kind) {
      case "string":
        if (value != null && value !== "") args.push(def.flag, value as string);
        break;
      case "number":
        if (value !== undefined) args.push(def.flag, String(value));
        break;
      case "boolean":
        if (value === true) args.push(def.flag);
        break;
      case "variadic":
        if (Array.isArray(value) && value.length > 0)
          args.push(def.flag, ...value);
        break;
    }
  }

  return args;
};

const buildStream = (
  params: QueryParams | ResumeParams | ContinueParams,
  ParamType: ParamClass,
  operation: string,
): Stream.Stream<
  ClaudeEvent,
  ClaudeCliSpawnError | ClaudeCliParseError | ClaudeCliProcessError,
  CommandExecutor.CommandExecutor
> => {
  const args = buildArgs(params, ParamType);
  let command = Command.make("claude", ...args);
  if (params.cwd) command = Command.workingDirectory(command, params.cwd);

  return Stream.unwrapScoped(
    Effect.gen(function* () {
      yield* Effect.logInfo("Spawning CLI process").pipe(
        Effect.annotateLogs("args", args.join(" ")),
      );

      const process = yield* Command.start(command).pipe(
        Effect.tapError((cause) =>
          Effect.logError("CLI spawn failed").pipe(
            Effect.annotateLogs("error", String(cause)),
          ),
        ),
        Effect.mapError(
          (cause) => new ClaudeCliSpawnError({ message: String(cause), cause }),
        ),
      );

      yield* Effect.logInfo("CLI process started");

      // Collect stderr concurrently; forkScoped ties the fiber lifetime to the stream scope
      const stderrFiber = yield* process.stderr.pipe(
        Stream.decodeText(),
        Stream.runFold("", (acc, s) => acc + s),
        Effect.mapError(
          (cause) => new ClaudeCliSpawnError({ message: String(cause), cause }),
        ),
        Effect.forkScoped,
      );

      // After stdout drains, verify exit code; fail stream if non-zero
      const checkExit = Effect.gen(function* () {
        const exitCode = yield* process.exitCode.pipe(
          Effect.mapError(
            (cause) =>
              new ClaudeCliSpawnError({
                message: "Failed to get process exit code",
                cause,
              }),
          ),
        );

        yield* Effect.logInfo("CLI process exited").pipe(
          Effect.annotateLogs("exitCode", exitCode),
        );

        if (exitCode !== 0) {
          const stderr = yield* Fiber.join(stderrFiber);
          yield* Effect.logError("CLI process failed").pipe(
            Effect.annotateLogs("exitCode", exitCode),
            Effect.annotateLogs("stderr", stderr),
          );
          return yield* new ClaudeCliProcessError({ exitCode, stderr });
        }
      });

      const eventStream = process.stdout.pipe(
        Stream.mapError(
          (cause) => new ClaudeCliSpawnError({ message: String(cause), cause }),
        ),
        Stream.decodeText(),
        Stream.splitLines,
        Stream.filter((line) => line.trim().length > 0),
        Stream.mapEffect((line) =>
          Schema.decodeUnknown(Schema.parseJson(ClaudeEvent))(line).pipe(
            Effect.tap((event) =>
              Effect.logDebug("Event decoded").pipe(
                Effect.annotateLogs("eventType", event.type),
                Effect.annotateLogs(
                  annotations.sessionId,
                  "session_id" in event
                    ? (event.session_id ?? "unknown")
                    : "unknown",
                ),
              ),
            ),
            Effect.tapError(() =>
              Effect.logWarning("Event parse failed").pipe(
                Effect.annotateLogs("raw", line.slice(0, 200)),
              ),
            ),
            Effect.mapError(
              (cause) => new ClaudeCliParseError({ raw: line, cause }),
            ),
          ),
        ),
        // Stream.concat runs checkExit after stdout drains and propagates any ClaudeCliError
        Stream.concat(Stream.fromEffect(checkExit).pipe(Stream.drain)),
      );

      return eventStream;
    }).pipe(
      Effect.annotateLogs(annotations.service, "cli"),
      Effect.annotateLogs(annotations.operation, operation),
      Effect.withSpan("cli-spawn"),
    ),
  );
};

export const ClaudeCliLive = Layer.effect(
  ClaudeCli,
  Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;

    yield* Effect.logInfo("ClaudeCliLive layer constructed");

    const provide = <A, E>(
      stream: Stream.Stream<A, E, CommandExecutor.CommandExecutor>,
    ) =>
      stream.pipe(
        Stream.provideService(CommandExecutor.CommandExecutor, executor),
      );

    return {
      query: (params: QueryParams) =>
        provide(buildStream(params, QueryParams, "query")),
      resume: (params: ResumeParams) =>
        provide(buildStream(params, ResumeParams, "resume")),
      cont: (params: ContinueParams) =>
        provide(buildStream(params, ContinueParams, "cont")),
    };
  }).pipe(Effect.annotateLogs(annotations.service, "cli")),
);
