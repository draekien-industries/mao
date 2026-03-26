import { Effect, Layer } from "effect";
import { annotations } from "../../diagnostics";
import { EventStore } from "../event-store/service-definition";
import { ReconstructedSession } from "./schemas";
import { SessionReconstructor } from "./service-definition";

export const makeSessionReconstructorLive = () =>
  Layer.effect(
    SessionReconstructor,
    Effect.gen(function* () {
      yield* EventStore;

      const reconstruct = (_sessionId: string) =>
        Effect.succeed(
          new ReconstructedSession({
            messages: [],
            sessionId: "",
          }),
        ).pipe(
          Effect.annotateLogs(annotations.operation, "reconstruct"),
        );

      return { reconstruct };
    }).pipe(
      Effect.annotateLogs(annotations.service, "session-reconstructor"),
    ),
  );
