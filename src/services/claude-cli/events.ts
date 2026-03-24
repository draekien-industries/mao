import { Schema } from "effect"

// Token usage counts (shared by multiple event types)
export class Usage extends Schema.Class<Usage>("Usage")({
  input_tokens: Schema.optional(Schema.Number),
  output_tokens: Schema.optional(Schema.Number),
  cache_creation_input_tokens: Schema.optional(Schema.Number),
  cache_read_input_tokens: Schema.optional(Schema.Number),
}) {}

// Content block variants (text or tool use)
export class TextBlock extends Schema.Class<TextBlock>("TextBlock")({
  type: Schema.Literal("text"),
  text: Schema.String,
}) {}

export class ToolUseBlock extends Schema.Class<ToolUseBlock>("ToolUseBlock")({
  type: Schema.Literal("tool_use"),
  id: Schema.String,
  name: Schema.String,
  input: Schema.Unknown,
}) {}

export const ContentBlock = Schema.Union(TextBlock, ToolUseBlock)
export type ContentBlock = typeof ContentBlock.Type

// Delta variants for streaming content
export class TextDelta extends Schema.Class<TextDelta>("TextDelta")({
  type: Schema.Literal("text_delta"),
  text: Schema.String,
}) {}

export class InputJsonDelta extends Schema.Class<InputJsonDelta>("InputJsonDelta")({
  type: Schema.Literal("input_json_delta"),
  partial_json: Schema.String,
}) {}

export const ContentDelta = Schema.Union(TextDelta, InputJsonDelta)
export type ContentDelta = typeof ContentDelta.Type

// API streaming events (nested inside StreamEventMessage.event)
export class MessageStartApiEvent extends Schema.Class<MessageStartApiEvent>("MessageStartApiEvent")({
  type: Schema.Literal("message_start"),
  message: Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("message"),
    role: Schema.Literal("assistant"),
    content: Schema.Array(Schema.Unknown),
    model: Schema.String,
    stop_reason: Schema.NullOr(Schema.String),
    stop_sequence: Schema.NullOr(Schema.String),
    usage: Usage,
  }),
}) {}

export class ContentBlockStartApiEvent extends Schema.Class<ContentBlockStartApiEvent>("ContentBlockStartApiEvent")({
  type: Schema.Literal("content_block_start"),
  index: Schema.Number,
  content_block: ContentBlock,
}) {}

export class ContentBlockDeltaApiEvent extends Schema.Class<ContentBlockDeltaApiEvent>("ContentBlockDeltaApiEvent")({
  type: Schema.Literal("content_block_delta"),
  index: Schema.Number,
  delta: ContentDelta,
}) {}

export class ContentBlockStopApiEvent extends Schema.Class<ContentBlockStopApiEvent>("ContentBlockStopApiEvent")({
  type: Schema.Literal("content_block_stop"),
  index: Schema.Number,
}) {}

export class MessageDeltaApiEvent extends Schema.Class<MessageDeltaApiEvent>("MessageDeltaApiEvent")({
  type: Schema.Literal("message_delta"),
  delta: Schema.Struct({
    stop_reason: Schema.NullOr(Schema.String),
    stop_sequence: Schema.NullOr(Schema.String),
  }),
  usage: Schema.Struct({ output_tokens: Schema.Number }),
}) {}

export class MessageStopApiEvent extends Schema.Class<MessageStopApiEvent>("MessageStopApiEvent")({
  type: Schema.Literal("message_stop"),
}) {}

export const ApiStreamEvent = Schema.Union(
  MessageStartApiEvent,
  ContentBlockStartApiEvent,
  ContentBlockDeltaApiEvent,
  ContentBlockStopApiEvent,
  MessageDeltaApiEvent,
  MessageStopApiEvent,
)
export type ApiStreamEvent = typeof ApiStreamEvent.Type
