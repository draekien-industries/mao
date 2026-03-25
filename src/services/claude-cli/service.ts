import { Command, CommandExecutor } from "@effect/platform";
import { Effect, Fiber, Layer, Schema, Stream } from "effect";
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
      case "compound-boolean":
        if (value === true) args.push(...def.flags);
        break;
    }
  }

  return args;
};

const buildStream = (
  params: QueryParams | ResumeParams | ContinueParams,
  ParamType: ParamClass,
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
      const process = yield* Command.start(command).pipe(
        Effect.mapError(
          (cause) => new ClaudeCliSpawnError({ message: String(cause), cause }),
        ),
      );

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
        if (exitCode !== 0) {
          const stderr = yield* Fiber.join(stderrFiber);
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
            Effect.mapError(
              (cause) => new ClaudeCliParseError({ raw: line, cause }),
            ),
          ),
        ),
        // Stream.concat runs checkExit after stdout drains and propagates any ClaudeCliError
        Stream.concat(Stream.fromEffect(checkExit).pipe(Stream.drain)),
      );

      return eventStream;
    }),
  );
};

export const ClaudeCliLive = Layer.effect(
  ClaudeCli,
  Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;
    const provide = <A, E>(
      stream: Stream.Stream<A, E, CommandExecutor.CommandExecutor>,
    ) =>
      stream.pipe(
        Stream.provideService(CommandExecutor.CommandExecutor, executor),
      );

    return {
      query: (params: QueryParams) => provide(buildStream(params, QueryParams)),
      resume: (params: ResumeParams) =>
        provide(buildStream(params, ResumeParams)),
      cont: (params: ContinueParams) =>
        provide(buildStream(params, ContinueParams)),
    };
  }),
);
