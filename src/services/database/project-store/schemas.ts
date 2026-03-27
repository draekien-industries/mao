import { Schema } from "effect";

const SqliteBoolean = Schema.transform(Schema.Number, Schema.Boolean, {
  decode: (n) => n !== 0,
  encode: (b) => (b ? 1 : 0),
});

export class Project extends Schema.Class<Project>("Project")({
  created_at: Schema.String,
  directory: Schema.String,
  id: Schema.Number,
  is_git_repo: SqliteBoolean,
  name: Schema.String,
  updated_at: Schema.String,
  worktree_base_path: Schema.NullOr(Schema.String),
}) {}

export class ProjectCreate extends Schema.Class<ProjectCreate>(
  "ProjectCreate",
)({
  directory: Schema.String,
  is_git_repo: Schema.Boolean,
  name: Schema.String,
  worktree_base_path: Schema.optional(Schema.String),
}) {}
