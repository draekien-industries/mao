import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import {
  errorAtom,
  eventsAtom,
  isStreamingAtom,
  messagesAtom,
  sendMessageAtom,
  streamingTextAtom,
} from "@/atoms/chat";
import { DebugEventPanel } from "@/components/debug-event-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebugPanel } from "./__root";

const TAB_ID = "tab-1";

export const Route = createFileRoute("/")({
  component: IndexComponent,
});

function IndexComponent() {
  const messages = useAtomValue(messagesAtom(TAB_ID));
  const streamingText = useAtomValue(streamingTextAtom(TAB_ID));
  const isStreaming = useAtomValue(isStreamingAtom(TAB_ID));
  const error = useAtomValue(errorAtom(TAB_ID));
  const events = useAtomValue(eventsAtom(TAB_ID));
  const sendMessage = useAtomSet(sendMessageAtom(TAB_ID));
  const { debugOpen } = useDebugPanel();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef(0);

  const form = useForm({
    defaultValues: { prompt: "" },
    onSubmit: ({ value }) => {
      const trimmed = value.prompt.trim();
      if (!trimmed) return;
      sendMessage(trimmed);
      form.reset();
    },
  });

  useEffect(() => {
    cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: isStreaming ? "instant" : "smooth",
      });
    });
  }, [messages, streamingText, isStreaming]);

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && !streamingText && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Send a message to start chatting.
            </p>
          )}

          {messages.map((msg, i) => (
            <div
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start",
              )}
              key={i}
            >
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted",
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {streamingText && (
            <div className="flex justify-start">
              <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-muted px-3.5 py-2 text-sm">
                {streamingText}
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <form
          className="flex gap-2 border-t border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <form.Field
            children={(field) => (
              <Input
                autoFocus
                disabled={isStreaming}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={
                  isStreaming ? "Waiting for response..." : "Message..."
                }
                value={field.state.value}
              />
            )}
            name="prompt"
          />
          <Button disabled={isStreaming} size="icon" type="submit">
            <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2} />
          </Button>
        </form>
      </div>

      <DebugEventPanel
        eventCount={events.length}
        events={[...events]}
        isOpen={debugOpen}
      />
    </div>
  );
}
