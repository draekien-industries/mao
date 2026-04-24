import { Context, Data, Effect, Layer } from "effect";
import { annotations } from "../diagnostics";

export class ClaudeAgentAuthMissing extends Data.TaggedError(
  "ClaudeAgentAuthMissing",
)<{ readonly message: string }> {}

export class ClaudeAgentAuth extends Context.Tag("ClaudeAgentAuth")<
  ClaudeAgentAuth,
  {
    readonly getToken: Effect.Effect<string, ClaudeAgentAuthMissing>;
  }
>() {}

export const makeClaudeAgentAuthLive = () =>
  Layer.effect(
    ClaudeAgentAuth,
    Effect.gen(function* () {
      yield* Effect.logInfo("ClaudeAgentAuth layer constructed");
      const getToken = Effect.sync(
        () => process.env.CLAUDE_CODE_OAUTH_TOKEN,
      ).pipe(
        Effect.flatMap((v) =>
          v && v.length > 0
            ? Effect.succeed(v)
            : Effect.fail(
                new ClaudeAgentAuthMissing({
                  message:
                    "CLAUDE_CODE_OAUTH_TOKEN is not set. Run `claude setup-token` and export the token.",
                }),
              ),
        ),
        Effect.tapError((err) =>
          Effect.logError("Auth missing").pipe(
            Effect.annotateLogs("error", err.message),
          ),
        ),
        Effect.annotateLogs(annotations.operation, "getToken"),
      );
      return { getToken };
    }).pipe(Effect.annotateLogs(annotations.service, "claude-agent-auth")),
  );
