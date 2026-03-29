import { Schema } from "effect";

export class ChatMessage extends Schema.Class<ChatMessage>("ChatMessage")({
  content: Schema.String,
  createdAt: Schema.String,
  id: Schema.Number,
  isError: Schema.optional(Schema.Boolean),
  role: Schema.Union(
    Schema.Literal("user"),
    Schema.Literal("assistant"),
    Schema.Literal("tool_result"),
  ),
  toolUseId: Schema.optional(Schema.String),
}) {}

export class ReconstructedSession extends Schema.Class<ReconstructedSession>(
  "ReconstructedSession",
)({
  messages: Schema.Array(ChatMessage),
  sessionId: Schema.String,
}) {}
