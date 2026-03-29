import { Schema } from "effect";

export class CreateProjectParams extends Schema.Class<CreateProjectParams>(
  "CreateProjectParams",
)({
  directory: Schema.String,
  is_git_repo: Schema.Boolean,
  name: Schema.String,
  worktree_base_path: Schema.optional(Schema.String),
}) {}

export class CreateTabParams extends Schema.Class<CreateTabParams>(
  "CreateTabParams",
)({
  cwd: Schema.String,
  display_label: Schema.optional(Schema.String),
  git_branch: Schema.optional(Schema.String),
  project_id: Schema.optional(Schema.Number),
  session_id: Schema.optional(Schema.String),
}) {}

export class ListProjectsParams extends Schema.Class<ListProjectsParams>(
  "ListProjectsParams",
)({}) {}

export class ListTabsParams extends Schema.Class<ListTabsParams>(
  "ListTabsParams",
)({}) {}

export class ReconstructSessionParams extends Schema.Class<ReconstructSessionParams>(
  "ReconstructSessionParams",
)({
  sessionId: Schema.String,
}) {}

export class RemoveProjectParams extends Schema.Class<RemoveProjectParams>(
  "RemoveProjectParams",
)({
  id: Schema.Number,
}) {}

export class UpdateTabParams extends Schema.Class<UpdateTabParams>(
  "UpdateTabParams",
)({
  id: Schema.Number,
  cwd: Schema.optional(Schema.String),
  display_label: Schema.optional(Schema.String),
  git_branch: Schema.optional(Schema.String),
  project_id: Schema.optional(Schema.Number),
  session_id: Schema.optional(Schema.String),
}) {}
