import { Effect, Layer } from "effect";
import { extractAssistantText } from "@/lib/extract-assistant-text";
import {
  isAssistantMessage,
  isUserMessage as isSDKUserMessage,
  isSystemInitMessage,
} from "../../claude-agent/events";
import { annotations } from "../../diagnostics";
import { isUserMessage } from "../event-store/schemas";
import { EventStore } from "../event-store/service-definition";
import { ChatMessage, ReconstructedSession } from "./schemas";
import { SessionReconstructor } from "./service-definition";

export const makeSessionReconstructorLive = () =>
  Layer.effect(
    SessionReconstructor,
    Effect.gen(function* () {
      const eventStore = yield* EventStore;
      yield* Effect.logInfo("SessionReconstructor layer constructed");

      const reconstruct = (sessionId: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug("Reconstructing session");
          const rows = yield* eventStore.getBySessionWithMeta(sessionId);

          let extractedSessionId = sessionId;
          const messages: Array<ChatMessage> = [];

          for (const row of rows) {
            if (isSystemInitMessage(row.event)) {
              extractedSessionId = row.event.session_id;
            } else if (isUserMessage(row.event)) {
              messages.push(
                new ChatMessage({
                  content: row.event.prompt,
                  createdAt: row.createdAt,
                  id: row.sequenceNumber,
                  role: "user",
                }),
              );
            } else if (isAssistantMessage(row.event)) {
              messages.push(
                new ChatMessage({
                  content: extractAssistantText(row.event),
                  createdAt: row.createdAt,
                  id: row.sequenceNumber,
                  role: "assistant",
                }),
              );
            } else if (isSDKUserMessage(row.event)) {
              const blocks = row.event.message.content;
              if (blocks.length === 0) {
                yield* Effect.logDebug(
                  "Skipping SDKUserMessage with empty content",
                );
              } else {
                const contentText = blocks
                  .map((block) => {
                    if (typeof block.content === "string") return block.content;
                    return block.content
                      .map((c) => c.text ?? "")
                      .filter((t) => t.length > 0)
                      .join("\n");
                  })
                  .join("\n");
                const firstBlock = blocks[0];
                messages.push(
                  new ChatMessage({
                    content: contentText,
                    createdAt: row.createdAt,
                    id: row.sequenceNumber,
                    isError: firstBlock?.is_error || undefined,
                    role: "tool_result",
                    toolUseId: firstBlock?.tool_use_id,
                  }),
                );
              }
            }
            // SDKResultMessage, SDKUnknownMessage -> skipped, not rendered as chat messages
          }

          yield* Effect.logInfo("Session reconstructed").pipe(
            Effect.annotateLogs("messageCount", String(messages.length)),
          );

          return new ReconstructedSession({
            messages,
            sessionId: extractedSessionId,
          });
        }).pipe(
          Effect.annotateLogs(annotations.operation, "reconstruct"),
          Effect.annotateLogs(annotations.sessionId, sessionId),
        );

      return { reconstruct };
    }).pipe(Effect.annotateLogs(annotations.service, "session-reconstructor")),
  );
