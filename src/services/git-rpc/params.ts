import { Schema } from "effect";

export class CreateWorktreeParams extends Schema.Class<CreateWorktreeParams>(
  "CreateWorktreeParams",
)({
  basePath: Schema.String,
  branchName: Schema.String,
  cwd: Schema.String,
}) {}

export class GetCurrentBranchParams extends Schema.Class<GetCurrentBranchParams>(
  "GetCurrentBranchParams",
)({
  cwd: Schema.String,
}) {}

export class GetRepoNameParams extends Schema.Class<GetRepoNameParams>(
  "GetRepoNameParams",
)({
  cwd: Schema.String,
}) {}

export class IsGitRepoParams extends Schema.Class<IsGitRepoParams>(
  "IsGitRepoParams",
)({
  cwd: Schema.String,
}) {}

export class ListBranchesParams extends Schema.Class<ListBranchesParams>(
  "ListBranchesParams",
)({
  cwd: Schema.String,
}) {}

export class ListWorktreesParams extends Schema.Class<ListWorktreesParams>(
  "ListWorktreesParams",
)({
  cwd: Schema.String,
}) {}

export class RemoveWorktreeParams extends Schema.Class<RemoveWorktreeParams>(
  "RemoveWorktreeParams",
)({
  cwd: Schema.String,
  worktreePath: Schema.String,
}) {}
