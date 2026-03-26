import type { Effect } from "effect";
import { Context } from "effect";
import type { DatabaseQueryError } from "../errors";
import type { StoredEvent } from "./schemas";

export class EventStore extends Context.Tag("EventStore")<
  EventStore,
  {
    readonly append: (
      sessionId: string,
      eventType: string,
      eventData: string,
    ) => Effect.Effect<void, DatabaseQueryError>;
    readonly getBySession: (
      sessionId: string,
    ) => Effect.Effect<ReadonlyArray<StoredEvent>, DatabaseQueryError>;
    readonly purgeSession: (
      sessionId: string,
    ) => Effect.Effect<void, DatabaseQueryError>;
  }
>() {}
