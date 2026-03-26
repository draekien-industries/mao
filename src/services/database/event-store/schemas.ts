import { Schema } from "effect";
import {
  AssistantMessageEvent,
  ResultEvent,
  SystemInitEvent,
  SystemRetryEvent,
  UnknownEvent,
} from "../../claude-cli/events";

export class UserMessageEvent extends Schema.Class<UserMessageEvent>(
  "UserMessageEvent",
)({
  type: Schema.Literal("user_message"),
  prompt: Schema.String,
}) {}

// D-02: Separate StoredEvent union keeps ClaudeEvent pure
// D-01: UserMessageEvent stores prompt text only; timestamp from created_at column
// Note: StreamEventMessage excluded -- never stored (Phase 3 buffers and discards them)
// UnknownEvent must be last -- catchall for unknown types
export const StoredEvent = Schema.Union(
  SystemInitEvent,
  SystemRetryEvent,
  AssistantMessageEvent,
  ResultEvent,
  UserMessageEvent,
  UnknownEvent,
);
export type StoredEvent = typeof StoredEvent.Type;

export const isUserMessage = Schema.is(UserMessageEvent);

export interface StoredEventWithMeta {
  readonly createdAt: string;
  readonly event: StoredEvent;
  readonly sequenceNumber: number;
}
