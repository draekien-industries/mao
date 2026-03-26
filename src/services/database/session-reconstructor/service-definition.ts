import type { Effect } from "effect";
import { Context } from "effect";
import type { DatabaseQueryError } from "../errors";
import type { ReconstructedSession } from "./schemas";

export class SessionReconstructor extends Context.Tag(
  "SessionReconstructor",
)<
  SessionReconstructor,
  {
    readonly reconstruct: (
      sessionId: string,
    ) => Effect.Effect<ReconstructedSession, DatabaseQueryError>;
  }
>() {}
