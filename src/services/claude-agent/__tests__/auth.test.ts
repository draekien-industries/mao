import { Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { ClaudeAgentAuth, makeClaudeAgentAuthLive } from "../auth";

describe("ClaudeAgentAuth", () => {
  it("returns the token from CLAUDE_CODE_OAUTH_TOKEN", async () => {
    const prev = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "sk-ant-oat01-test";
    try {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* ClaudeAgentAuth;
          return yield* auth.getToken;
        }).pipe(Effect.provide(makeClaudeAgentAuthLive())),
      );
      expect(result).toBe("sk-ant-oat01-test");
    } finally {
      if (prev !== undefined) process.env.CLAUDE_CODE_OAUTH_TOKEN = prev;
      else delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  });

  it("fails with ClaudeAgentAuthMissing when token is not set", async () => {
    const prev = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    try {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* ClaudeAgentAuth;
          return yield* auth.getToken;
        }).pipe(Effect.provide(makeClaudeAgentAuthLive()), Effect.either),
      );
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left._tag).toBe("ClaudeAgentAuthMissing");
      }
    } finally {
      if (prev !== undefined) process.env.CLAUDE_CODE_OAUTH_TOKEN = prev;
    }
  });
});
