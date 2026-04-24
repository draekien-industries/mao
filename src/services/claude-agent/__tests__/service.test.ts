import { Effect, Either, Layer, Stream } from "effect";
import { describe, expect, it, vi } from "vitest";
import { makeClaudeAgentAuthLive } from "../auth";
import { QueryParams } from "../params";
import { ClaudeAgent } from "../service-definition";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(() => {
    async function* gen() {
      yield {
        type: "system",
        subtype: "init",
        uuid: "u1",
        session_id: "s1",
        tools: [],
        model: "claude-sonnet-4-6",
        permissionMode: "default",
        cwd: "/tmp",
        apiKeySource: "oauth",
      };
      yield {
        type: "result",
        subtype: "success",
        uuid: "u2",
        session_id: "s1",
        is_error: false,
        duration_ms: 100,
        duration_api_ms: 90,
        num_turns: 1,
        total_cost_usd: 0.001,
        usage: { input_tokens: 10, output_tokens: 3 },
      };
    }
    return gen();
  }),
}));

describe("ClaudeAgentLive", () => {
  it("streams decoded SDKMessages", async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "sk-ant-oat01-test";
    const { makeClaudeAgentLive } = await import("../service");
    const layer = makeClaudeAgentLive().pipe(
      Layer.provide(makeClaudeAgentAuthLive()),
    );
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* ClaudeAgent;
        return yield* Stream.runCollect(
          svc.query(new QueryParams({ prompt: "hi" })),
        );
      }).pipe(Effect.provide(layer)),
    );
    const arr = Array.from(events);
    expect(arr.length).toBe(2);
    expect(arr[0].type).toBe("system");
    expect(arr[1].type).toBe("result");
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  it("fails with ClaudeAgentSpawnError when auth token is missing", async () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const { makeClaudeAgentLive } = await import("../service");
    const layer = makeClaudeAgentLive().pipe(
      Layer.provide(makeClaudeAgentAuthLive()),
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* ClaudeAgent;
        return yield* Stream.runCollect(
          svc.query(new QueryParams({ prompt: "hi" })),
        );
      }).pipe(Effect.provide(layer), Effect.either),
    );
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("ClaudeAgentSpawnError");
    }
  });
});
