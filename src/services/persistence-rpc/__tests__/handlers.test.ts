import { RpcTest } from "@effect/rpc";
import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  ChatMessage,
  ReconstructedSession,
} from "../../database/session-reconstructor/schemas";
import { SessionReconstructor } from "../../database/session-reconstructor/service-definition";
import { Tab } from "../../database/tab-store/schemas";
import { TabStore } from "../../database/tab-store/service-definition";
import { PersistenceRpcGroup } from "../group";
import { PersistenceRpcHandlers } from "../handlers";

const mockTab = new Tab({
  created_at: "2026-01-01T00:00:00Z",
  cwd: "/home/user/project",
  display_label: null,
  git_branch: null,
  id: 1,
  session_id: "sess-1",
  updated_at: "2026-01-01T00:00:00Z",
});

const mockSession = new ReconstructedSession({
  messages: [
    new ChatMessage({
      content: "hello",
      createdAt: "2026-01-01T00:00:00Z",
      id: 1,
      role: "user",
    }),
  ],
  sessionId: "sess-1",
});

const mockReconstructor = {
  reconstruct: (sessionId: string) =>
    Effect.succeed(
      new ReconstructedSession({
        messages: mockSession.messages,
        sessionId,
      }),
    ),
};

const mockTabStore = {
  create: () => Effect.succeed(mockTab),
  delete: () => Effect.succeed(undefined as void),
  getAll: () => Effect.succeed([mockTab]),
  getById: () => Effect.succeed(Option.none()),
  update: () => Effect.succeed(undefined as void),
};

const testLayer = PersistenceRpcHandlers.pipe(
  Layer.provide(Layer.succeed(SessionReconstructor, mockReconstructor)),
  Layer.provide(Layer.succeed(TabStore, mockTabStore)),
);

describe("PersistenceRpcHandlers", () => {
  it("reconstructSession calls SessionReconstructor.reconstruct with correct sessionId", async () => {
    const program = Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(PersistenceRpcGroup);
      return yield* client.reconstructSession({ sessionId: "sess-1" });
    });

    const result = await Effect.runPromise(
      Effect.scoped(program.pipe(Effect.provide(testLayer))),
    );

    expect(result.sessionId).toBe("sess-1");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe("hello");
    expect(result.messages[0].role).toBe("user");
  });

  it("listTabs calls TabStore.getAll", async () => {
    const program = Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(PersistenceRpcGroup);
      return yield* client.listTabs({});
    });

    const result = await Effect.runPromise(
      Effect.scoped(program.pipe(Effect.provide(testLayer))),
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].cwd).toBe("/home/user/project");
    expect(result[0].session_id).toBe("sess-1");
  });
});
