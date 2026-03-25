import { Schema } from "effect";

export class DatabaseOpenError extends Schema.TaggedError<DatabaseOpenError>()(
  "DatabaseOpenError",
  { cause: Schema.String, message: Schema.String },
) {}

export class DatabaseCorruptionError extends Schema.TaggedError<DatabaseCorruptionError>()(
  "DatabaseCorruptionError",
  { message: Schema.String },
) {}

export class DatabaseQueryError extends Schema.TaggedError<DatabaseQueryError>()(
  "DatabaseQueryError",
  { cause: Schema.String, message: Schema.String },
) {}

export const DatabaseErrorSchema = Schema.Union(
  DatabaseOpenError,
  DatabaseCorruptionError,
  DatabaseQueryError,
);

export type DatabaseError = Schema.Schema.Type<typeof DatabaseErrorSchema>;

export function formatDatabaseError(err: DatabaseError): string {
  switch (err._tag) {
    case "DatabaseOpenError":
      return `Failed to open database: ${err.message}`;
    case "DatabaseCorruptionError":
      return `Database corruption detected: ${err.message}`;
    case "DatabaseQueryError":
      return `Database query failed: ${err.message}`;
  }
}
