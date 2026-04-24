import { Schema } from "effect";
import {
  SDKAssistantMessage,
  SDKResultMessage,
  SDKSystemInitMessage,
  SDKUnknownMessage,
  SDKUserMessage,
} from "../../claude-agent/events";

export class UserMessageEvent extends Schema.Class<UserMessageEvent>(
  "UserMessageEvent",
)({
  type: Schema.Literal("user_message"),
  prompt: Schema.String,
}) {}

export const StoredEvent = Schema.Union(
  SDKSystemInitMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  UserMessageEvent,
  SDKUserMessage,
  SDKUnknownMessage,
);
export type StoredEvent = typeof StoredEvent.Type;

export const isUserMessage = Schema.is(UserMessageEvent);

export interface StoredEventWithMeta {
  readonly createdAt: string;
  readonly event: StoredEvent;
  readonly sequenceNumber: number;
}
