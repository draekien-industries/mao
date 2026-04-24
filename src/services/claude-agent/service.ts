import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import { Effect, Layer, Schema, Stream } from "effect";
import { annotations } from "../diagnostics";
import { ClaudeAgentAuth } from "./auth";
import {
  ClaudeAgentParseError,
  ClaudeAgentProcessError,
  ClaudeAgentSpawnError,
} from "./errors";
import { SDKMessage } from "./events";
import type { ContinueParams, QueryParams, ResumeParams } from "./params";
import { ClaudeAgent } from "./service-definition";

type AnyParams = QueryParams | ResumeParams | ContinueParams;
type Kind = "query" | "resume" | "cont";

const decodeMessage = Schema.decodeUnknown(SDKMessage);

const buildOptions = (
  params: AnyParams,
  kind: Kind,
  token: string,
): Options => {
  const options: Options = {
    env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: token },
    includePartialMessages: true,
  };

  if (params.cwd !== undefined) options.cwd = params.cwd;
  if (params.model !== undefined) options.model = params.model;
  if (params.append_system_prompt !== undefined) {
    options.systemPrompt = {
      type: "preset",
      preset: "claude_code",
      append: params.append_system_prompt,
    };
  }
  if (params.allowed_tools !== undefined && params.allowed_tools.length > 0) {
    options.allowedTools = [...params.allowed_tools];
  }
  if (params.max_turns !== undefined) options.maxTurns = params.max_turns;

  if (kind === "query") {
    const q = params as QueryParams;
    if (q.session_id !== undefined) options.sessionId = q.session_id;
  } else if (kind === "resume") {
    const r = params as ResumeParams;
    options.resume = r.session_id;
    if (r.fork === true) options.forkSession = true;
  } else {
    options.continue = true;
  }

  return options;
};

const runStream = (
  params: AnyParams,
  kind: Kind,
): Stream.Stream<
  SDKMessage,
  ClaudeAgentSpawnError | ClaudeAgentParseError | ClaudeAgentProcessError,
  ClaudeAgentAuth
> =>
  Stream.unwrapScoped(
    Effect.gen(function* () {
      const auth = yield* ClaudeAgentAuth;
      const token = yield* auth.getToken.pipe(
        Effect.mapError(
          (err) =>
            new ClaudeAgentSpawnError({
              message: err.message,
              cause: err._tag,
            }),
        ),
      );

      yield* Effect.logDebug("Starting SDK query").pipe(
        Effect.annotateLogs(annotations.operation, kind),
      );

      const options = buildOptions(params, kind, token);
      const iterator = sdkQuery({ prompt: params.prompt, options });

      return Stream.fromAsyncIterable(
        iterator,
        (cause) =>
          new ClaudeAgentProcessError({
            message: "SDK iterator failed",
            cause: String(cause),
          }),
      ).pipe(
        Stream.mapEffect((raw) =>
          decodeMessage(raw).pipe(
            Effect.tap((msg) =>
              Effect.logDebug("SDK message").pipe(
                Effect.annotateLogs("type", msg.type),
                Effect.annotateLogs(
                  annotations.sessionId,
                  "session_id" in msg
                    ? (msg.session_id ?? "unknown")
                    : "unknown",
                ),
              ),
            ),
            Effect.mapError(
              (cause) =>
                new ClaudeAgentParseError({
                  raw: JSON.stringify(raw),
                  cause: String(cause),
                }),
            ),
          ),
        ),
      );
    }).pipe(
      Effect.annotateLogs(annotations.service, "claude-agent"),
      Effect.annotateLogs(annotations.operation, kind),
    ),
  );

export const makeClaudeAgentLive = () =>
  Layer.effect(
    ClaudeAgent,
    Effect.gen(function* () {
      const auth = yield* ClaudeAgentAuth;
      yield* Effect.logInfo("ClaudeAgentLive layer constructed").pipe(
        Effect.annotateLogs(annotations.service, "claude-agent"),
      );
      const provide = <A, E>(
        stream: Stream.Stream<A, E, ClaudeAgentAuth>,
      ): Stream.Stream<A, E, never> =>
        stream.pipe(Stream.provideService(ClaudeAgentAuth, auth));

      return {
        query: (p: QueryParams) => provide(runStream(p, "query")),
        resume: (p: ResumeParams) => provide(runStream(p, "resume")),
        cont: (p: ContinueParams) => provide(runStream(p, "cont")),
      };
    }).pipe(Effect.annotateLogs(annotations.service, "claude-agent")),
  );
