import { Schema } from "effect";

export class ChatMessage extends Schema.Class<ChatMessage>("ChatMessage")({
  content: Schema.String,
  createdAt: Schema.String,
  id: Schema.Number,
  role: Schema.Union(Schema.Literal("user"), Schema.Literal("assistant")),
}) {}

export class ReconstructedSession extends Schema.Class<ReconstructedSession>(
  "ReconstructedSession",
)({
  messages: Schema.Array(ChatMessage),
  sessionId: Schema.String,
}) {}
