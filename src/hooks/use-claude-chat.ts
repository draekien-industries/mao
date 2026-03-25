import { Effect, Stream } from "effect";
import { useEffect, useRef, useState } from "react";
import { formatClaudeCliError } from "@/services/claude-cli/errors";
import type { ClaudeEvent } from "@/services/claude-cli/events";
import {
  isAssistantMessage,
  isContentBlockDelta,
  isResult,
  isStreamEvent,
  isSystemInit,
  isTextDelta,
} from "@/services/claude-cli/events";
import { QueryParams, ResumeParams } from "@/services/claude-cli/params";
import { ClaudeCli } from "@/services/claude-cli/service-definition";
import { useRuntime } from "@/services/claude-rpc/runtime";

export interface ChatMessage {
  readonly content: string;
  readonly role: "user" | "assistant";
}

export function useClaudeChat() {
  const runtime = useRuntime();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Events stored in a ref to avoid re-renders on every delta.
  // Bump a counter to notify the debug panel when it's open.
  const eventsRef = useRef<ClaudeEvent[]>([]);
  const [eventCount, setEventCount] = useState(0);

  const sessionIdRef = useRef<string | null>(null);
  const isStreamingRef = useRef(false);

  const sendMessage = (prompt: string) => {
    if (isStreamingRef.current || !prompt.trim()) return;

    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setStreamingText("");
    setError(null);
    setIsStreaming(true);
    isStreamingRef.current = true;

    const program = Effect.gen(function* () {
      const cli = yield* ClaudeCli;
      const stream = sessionIdRef.current
        ? cli.resume(
            new ResumeParams({
              prompt,
              session_id: sessionIdRef.current,
            }),
          )
        : cli.query(new QueryParams({ prompt }));

      yield* Stream.runForEach(stream, (event) =>
        Effect.sync(() => {
          eventsRef.current = [...eventsRef.current, event];
          setEventCount((c) => c + 1);

          if (isSystemInit(event)) {
            sessionIdRef.current = event.session_id;
          } else if (isStreamEvent(event)) {
            if (
              isContentBlockDelta(event.event) &&
              isTextDelta(event.event.delta)
            ) {
              const chunk = event.event.delta.text;
              setStreamingText((prev) => prev + chunk);
            }
          } else if (isAssistantMessage(event)) {
            const text = event.message.content
              .filter((block) => block.type === "text")
              .map((block) => ("text" in block ? block.text : ""))
              .join("");
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: text },
            ]);
            setStreamingText("");
          } else if (isResult(event)) {
            setIsStreaming(false);
            isStreamingRef.current = false;
          }
        }),
      );
    }).pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => {
          setError(formatClaudeCliError(err));
          setIsStreaming(false);
          isStreamingRef.current = false;
        }),
      ),
    );

    // Fire and forget — the stream completes in the background even if
    // the component unmounts (e.g. tab switch). setState calls on an
    // unmounted component are safely ignored in React 18+.
    runtime.runFork(program);
  };

  // Reset events when the hook mounts (fresh chat session)
  useEffect(() => {
    eventsRef.current = [];
    setEventCount(0);
  }, []);

  return {
    messages,
    streamingText,
    isStreaming,
    error,
    events: eventsRef.current,
    eventCount,
    sendMessage,
  };
}
