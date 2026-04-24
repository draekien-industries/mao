import { ConfigProvider, Effect, Either, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { ClaudeAgentAuth, makeClaudeAgentAuthLive } from "../auth";

const withToken = (token: string) =>
  makeClaudeAgentAuthLive().pipe(
    Layer.provide(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(new Map([["CLAUDE_CODE_OAUTH_TOKEN", token]])),
      ),
    ),
  );

const withoutToken = makeClaudeAgentAuthLive().pipe(
  Layer.provide(Layer.setConfigProvider(ConfigProvider.fromMap(new Map()))),
);

describe("ClaudeAgentAuth", () => {
  it("returns the token from CLAUDE_CODE_OAUTH_TOKEN", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* ClaudeAgentAuth;
        return yield* auth.getToken;
      }).pipe(Effect.provide(withToken("sk-ant-oat01-test"))),
    );
    expect(result).toBe("sk-ant-oat01-test");
  });

  it("fails with ClaudeAgentAuthMissing when token is not set", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* ClaudeAgentAuth;
        return yield* auth.getToken;
      }).pipe(Effect.provide(withoutToken), Effect.either),
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("ClaudeAgentAuthMissing");
    }
  });
});
