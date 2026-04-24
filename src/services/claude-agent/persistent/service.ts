import crypto from "node:crypto";
import { Effect, Layer, Option, Ref, Stream } from "effect";
import type { DatabaseQueryError } from "../../database/errors";
import { EventStore } from "../../database/event-store/service-definition";
import { annotations } from "../../diagnostics";
import type { ClaudeAgentError } from "../errors";
import {
  isAssistantMessage,
  isResultMessage,
  isSystemInitMessage,
  isUserMessage,
  type SDKMessage,
} from "../events";
import type { ContinueParams, ResumeParams } from "../params";
import { QueryParams } from "../params";
import { ClaudeAgent } from "../service-definition";

type EventStoreService = {
  readonly append: (
    sessionId: string,
    eventType: string,
    eventData: string,
  ) => Effect.Effect<void, DatabaseQueryError>;
};

const persist = (
  store: EventStoreService,
  sessionId: string,
  eventType: string,
  event: unknown,
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

const wrapStream = (
  store: EventStoreService,
  sessionId: string,
  stream: Stream.Stream<SDKMessage, ClaudeAgentError, never>,
): Stream.Stream<SDKMessage, ClaudeAgentError, never> =>
  stream.pipe(
    Stream.tap((event) => {
      if (isSystemInitMessage(event))
        return persist(store, sessionId, "system", event);
      if (isAssistantMessage(event))
        return persist(store, sessionId, "assistant", event);
      if (isResultMessage(event))
        return persist(store, sessionId, "result", event);
      if (isUserMessage(event)) return persist(store, sessionId, "user", event);
      return Effect.void;
    }),
  );

export const makePersistentClaudeAgentLive = () =>
  Layer.effect(
    ClaudeAgent,
    Effect.gen(function* () {
      const inner = yield* ClaudeAgent;
      const store = yield* EventStore;
      yield* Effect.logInfo("PersistentClaudeAgentLive layer constructed");

      return {
        query: (params: QueryParams) => {
          const sessionId = crypto.randomUUID();
          const enriched = new QueryParams({
            ...params,
            session_id: sessionId,
          });
          return Stream.concat(
            Stream.fromEffect(
              persistUserMessage(store, sessionId, params.prompt),
            ).pipe(Stream.drain),
            wrapStream(store, sessionId, inner.query(enriched)),
          );
        },

        resume: (params: ResumeParams) => {
          const sessionId = params.session_id;
          return Stream.concat(
            Stream.fromEffect(
              persistUserMessage(store, sessionId, params.prompt),
            ).pipe(Stream.drain),
            wrapStream(store, sessionId, inner.resume(params)),
          );
        },

        cont: (params: ContinueParams) =>
          Stream.unwrapScoped(
            Effect.gen(function* () {
              const sessionIdRef = yield* Ref.make(Option.none<string>());
              return inner.cont(params).pipe(
                Stream.tap((event) =>
                  Effect.gen(function* () {
                    if (isSystemInitMessage(event)) {
                      yield* Ref.set(
                        sessionIdRef,
                        Option.some(event.session_id),
                      );
                      yield* persist(store, event.session_id, "system", event);
                      yield* persistUserMessage(
                        store,
                        event.session_id,
                        params.prompt,
                      );
                      return;
                    }
                    const sid = yield* Ref.get(sessionIdRef);
                    if (Option.isNone(sid)) return;
                    if (isAssistantMessage(event))
                      yield* persist(store, sid.value, "assistant", event);
                    else if (isResultMessage(event))
                      yield* persist(store, sid.value, "result", event);
                    else if (isUserMessage(event))
                      yield* persist(store, sid.value, "user", event);
                  }),
                ),
              );
            }),
          ),
      };
    }).pipe(
      Effect.annotateLogs(annotations.service, "persistent-claude-agent"),
    ),
  );
