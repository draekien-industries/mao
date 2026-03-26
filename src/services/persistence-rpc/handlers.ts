import { Effect } from "effect";
import { SessionReconstructor } from "../database/session-reconstructor/service-definition";
import { TabStore } from "../database/tab-store/service-definition";
import { PersistenceRpcGroup } from "./group";

export const PersistenceRpcHandlers = PersistenceRpcGroup.toLayer(
  Effect.gen(function* () {
    const reconstructor = yield* SessionReconstructor;
    const tabStore = yield* TabStore;

    return {
      listTabs: () => tabStore.getAll(),
      reconstructSession: ({ sessionId }) =>
        reconstructor.reconstruct(sessionId),
    };
  }),
);
