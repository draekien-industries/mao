import { Schema } from "effect";

export class GitOperationError extends Schema.TaggedError<GitOperationError>()(
  "GitOperationError",
  { message: Schema.String, operation: Schema.String },
) {}
