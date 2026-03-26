import crypto from "node:crypto";
import { Effect, Layer, Ref, Stream } from "effect";
import type { DatabaseQueryError } from "../../database/errors";
import { EventStore } from "../../database/event-store/service-definition";
import { annotations } from "../../diagnostics";
import type { ClaudeCliError } from "../errors";
import {
  type ClaudeEvent,
  isAssistantMessage,
  isResult,
  isSystemInit,
} from "../events";
import type { ContinueParams, ResumeParams } from "../params";
import { QueryParams } from "../params";
import { ClaudeCli } from "../service-definition";

type EventStoreService = {
  readonly append: (
    sessionId: string,
    eventType: string,
    eventData: string,
  ) => Effect.Effect<void, DatabaseQueryError>;
};

// Persist a single event, swallowing write failures (D-18)
const persistEvent = (
  store: EventStoreService,
  sessionId: string,
  eventType: string,
  event: ClaudeEvent,
) =>
  store
    .append(sessionId, eventType, JSON.stringify(event))
    .pipe(
      Effect.catchAll((err: DatabaseQueryError) =>
        Effect.logWarning("Persistence write failed").pipe(
          Effect.annotateLogs("error", err.message),
          Effect.annotateLogs(annotations.sessionId, sessionId),
          Effect.annotateLogs("eventType", eventType),
        ),
      ),
    );

// Persist a user message event, swallowing write failures (D-18)
const persistUserMessage = (
  store: EventStoreService,
  sessionId: string,
  prompt: string,
) =>
  store
    .append(
      sessionId,
      "user_message",
      JSON.stringify({ type: "user_message", prompt }),
    )
    .pipe(
      Effect.catchAll((err: DatabaseQueryError) =>
        Effect.logWarning("Persistence write failed").pipe(
          Effect.annotateLogs("error", err.message),
          Effect.annotateLogs(annotations.sessionId, sessionId),
          Effect.annotateLogs("eventType", "user_message"),
        ),
      ),
    );

// Wrap a stream with selective persistence taps
// Only SystemInitEvent, AssistantMessageEvent, and ResultEvent are persisted
const wrapStream = (
  store: EventStoreService,
  sessionId: string,
  stream: Stream.Stream<ClaudeEvent, ClaudeCliError, never>,
): Stream.Stream<ClaudeEvent, ClaudeCliError, never> =>
  stream.pipe(
    Stream.tap((event) => {
      if (isSystemInit(event)) {
        return persistEvent(store, sessionId, "system", event);
      }
      if (isAssistantMessage(event)) {
        return persistEvent(store, sessionId, "assistant", event);
      }
      if (isResult(event)) {
        return persistEvent(store, sessionId, "result", event);
      }
      // D-04, D-05, D-06: discard StreamEventMessage, SystemRetryEvent, UnknownEvent
      return Effect.void;
    }),
  );

export const makePersistentClaudeCliLive = () =>
  Layer.effect(
    ClaudeCli,
    Effect.gen(function* () {
      const inner = yield* ClaudeCli;
      const store = yield* EventStore;

      yield* Effect.logInfo("PersistentClaudeCliLive layer constructed");

      return {
        query: (params: QueryParams) => {
          // D-08: pre-generate session_id UUID
          const sessionId = crypto.randomUUID();
          const enrichedParams = new QueryParams({
            ...params,
            session_id: sessionId,
          });

          // Persist user message before stream, then wrap inner stream
          return Stream.concat(
            Stream.fromEffect(
              persistUserMessage(store, sessionId, params.prompt),
            ).pipe(Stream.drain),
            wrapStream(store, sessionId, inner.query(enrichedParams)),
          );
        },

        resume: (params: ResumeParams) => {
          const sessionId = params.session_id;

          // Persist user message before stream, then wrap inner stream
          return Stream.concat(
            Stream.fromEffect(
              persistUserMessage(store, sessionId, params.prompt),
            ).pipe(Stream.drain),
            wrapStream(store, sessionId, inner.resume(params)),
          );
        },

        cont: (params: ContinueParams) => {
          // Session ID unknown upfront — extract from SystemInitEvent in-stream
          const sessionIdRef = Ref.unsafeMake("");

          return inner.cont(params).pipe(
            Stream.tap((event) =>
              Effect.gen(function* () {
                if (isSystemInit(event)) {
                  yield* Ref.set(sessionIdRef, event.session_id);
                  yield* persistEvent(store, event.session_id, "system", event);
                  // D-09: user message persisted after SystemInitEvent for cont
                  yield* persistUserMessage(
                    store,
                    event.session_id,
                    params.prompt,
                  );
                  return;
                }

                const currentSessionId = yield* Ref.get(sessionIdRef);
                if (currentSessionId === "") return;

                if (isAssistantMessage(event)) {
                  yield* persistEvent(
                    store,
                    currentSessionId,
                    "assistant",
                    event,
                  );
                  return;
                }

                if (isResult(event)) {
                  yield* persistEvent(store, currentSessionId, "result", event);
                }
              }),
            ),
          );
        },
      };
    }).pipe(Effect.annotateLogs(annotations.service, "persistent-cli")),
  );
