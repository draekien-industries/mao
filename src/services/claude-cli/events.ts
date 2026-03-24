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

// Top-level CLI stream-json events
export class SystemInitEvent extends Schema.Class<SystemInitEvent>("SystemInitEvent")({
  type: Schema.Literal("system"),
  subtype: Schema.Literal("init"),
  session_id: Schema.String,
  uuid: Schema.String,
}) {}

export class SystemRetryEvent extends Schema.Class<SystemRetryEvent>("SystemRetryEvent")({
  type: Schema.Literal("system"),
  subtype: Schema.Literal("api_retry"),
  attempt: Schema.Number,
  max_retries: Schema.Number,
  retry_delay_ms: Schema.Number,
  error_status: Schema.NullOr(Schema.Number),
  error: Schema.String,
  uuid: Schema.String,
  session_id: Schema.String,
}) {}

export class StreamEventMessage extends Schema.Class<StreamEventMessage>("StreamEventMessage")({
  type: Schema.Literal("stream_event"),
  event: ApiStreamEvent,
  parent_tool_use_id: Schema.NullOr(Schema.String),
  uuid: Schema.String,
  session_id: Schema.String,
}) {}

export class AssistantMessageEvent extends Schema.Class<AssistantMessageEvent>("AssistantMessageEvent")({
  type: Schema.Literal("assistant"),
  message: Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("message"),
    role: Schema.Literal("assistant"),
    content: Schema.Array(ContentBlock),
    model: Schema.String,
    stop_reason: Schema.NullOr(Schema.String),
    stop_sequence: Schema.NullOr(Schema.String),
    usage: Usage,
  }),
  uuid: Schema.String,
  session_id: Schema.String,
}) {}

export class ResultEvent extends Schema.Class<ResultEvent>("ResultEvent")({
  type: Schema.Literal("result"),
  subtype: Schema.String,
  result: Schema.String,
  is_error: Schema.Boolean,
  session_id: Schema.String,
  uuid: Schema.String,
  total_cost_usd: Schema.optional(Schema.Number),
  usage: Schema.optional(Usage),
}) {}

// Catchall — must be last; catches anything not matched above (e.g. "user"/tool_result events)
export class UnknownEvent extends Schema.Class<UnknownEvent>("UnknownEvent")({
  type: Schema.String,
  session_id: Schema.optional(Schema.String),
  uuid: Schema.optional(Schema.String),
}) {}

export const ClaudeEvent = Schema.Union(
  SystemInitEvent,
  SystemRetryEvent,
  StreamEventMessage,
  AssistantMessageEvent,
  ResultEvent,
  UnknownEvent, // must be last
)
export type ClaudeEvent = typeof ClaudeEvent.Type
