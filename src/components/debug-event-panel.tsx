import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  AssistantMessageEvent,
  ClaudeEvent,
  ResultEvent,
  StreamEventMessage,
  SystemInitEvent,
  SystemRetryEvent,
} from "@/services/claude-cli/events";

function EventCard({ event }: { event: ClaudeEvent }) {
  const [expanded, setExpanded] = useState(false);

  const { label, variant, summary } = describeEvent(event);

  return (
    <div className="rounded-lg border border-border bg-card p-2 text-xs">
      <button
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium",
            variant === "system" && "bg-blue-500/15 text-blue-600",
            variant === "stream" && "bg-zinc-500/15 text-zinc-500",
            variant === "assistant" && "bg-green-500/15 text-green-600",
            variant === "result" && "bg-amber-500/15 text-amber-600",
            variant === "unknown" && "bg-zinc-500/15 text-zinc-400",
          )}
        >
          {label}
        </span>
        <span className="min-w-0 truncate text-muted-foreground">
          {summary}
        </span>
        <span className="ml-auto shrink-0 text-muted-foreground">
          {expanded ? "\u25B4" : "\u25BE"}
        </span>
      </button>
      {expanded && (
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground">
          {JSON.stringify(event, null, 2)}
        </pre>
      )}
    </div>
  );
}

type EventVariant = "system" | "stream" | "assistant" | "result" | "unknown";

function describeEvent(event: ClaudeEvent): {
  label: string;
  variant: EventVariant;
  summary: string;
} {
  switch (event.type) {
    case "system": {
      if ("subtype" in event && event.subtype === "init") {
        const e = event as SystemInitEvent;
        return {
          label: "SystemInit",
          variant: "system",
          summary: `session: ${e.session_id.slice(0, 12)}...`,
        };
      }
      const e = event as SystemRetryEvent;
      return {
        label: "Retry",
        variant: "system",
        summary: `attempt ${e.attempt}/${e.max_retries}`,
      };
    }
    case "stream_event": {
      const e = event as StreamEventMessage;
      const apiType = e.event.type;
      if (
        apiType === "content_block_delta" &&
        e.event.delta.type === "text_delta"
      ) {
        const preview = e.event.delta.text.slice(0, 40);
        return {
          label: "TextDelta",
          variant: "stream",
          summary: preview || "(empty)",
        };
      }
      return { label: apiType, variant: "stream", summary: "" };
    }
    case "assistant": {
      const e = event as AssistantMessageEvent;
      const blockCount = e.message.content.length;
      return {
        label: "Assistant",
        variant: "assistant",
        summary: `${blockCount} block${blockCount !== 1 ? "s" : ""} \u00B7 ${e.message.model}`,
      };
    }
    case "result": {
      const e = event as ResultEvent;
      const cost = e.total_cost_usd
        ? ` \u00B7 $${e.total_cost_usd.toFixed(4)}`
        : "";
      return {
        label: e.is_error ? "Error" : "Result",
        variant: "result",
        summary: `${e.subtype}${cost}`,
      };
    }
    default:
      return { label: event.type, variant: "unknown", summary: "" };
  }
}

export function DebugEventPanel({
  events,
  eventCount,
  isOpen,
}: {
  events: ClaudeEvent[];
  eventCount: number;
  isOpen: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [eventCount, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="flex h-full w-[350px] shrink-0 flex-col border-l border-border">
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
        Events ({eventCount})
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {eventCount === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No events yet. Send a message to start.
          </p>
        )}
        {events.map((event, i) => (
          <EventCard event={event} key={i} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
