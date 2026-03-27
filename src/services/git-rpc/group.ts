import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { GitOperationError } from "../git/errors";
import { Worktree } from "../git/schemas";
import {
  CreateWorktreeParams,
  GetCurrentBranchParams,
  GetRepoNameParams,
  IsGitRepoParams,
  ListBranchesParams,
  ListWorktreesParams,
  RemoveWorktreeParams,
} from "./params";

export class GitRpcGroup extends RpcGroup.make(
  Rpc.make("createWorktree", {
    error: GitOperationError,
    payload: CreateWorktreeParams,
    success: Schema.String,
  }),
  Rpc.make("getCurrentBranch", {
    error: GitOperationError,
    payload: GetCurrentBranchParams,
    success: Schema.String,
  }),
  Rpc.make("getRepoName", {
    error: GitOperationError,
    payload: GetRepoNameParams,
    success: Schema.String,
  }),
  Rpc.make("isGitRepo", {
    error: GitOperationError,
    payload: IsGitRepoParams,
    success: Schema.Boolean,
  }),
  Rpc.make("listBranches", {
    error: GitOperationError,
    payload: ListBranchesParams,
    success: Schema.Array(Schema.String),
  }),
  Rpc.make("listWorktrees", {
    error: GitOperationError,
    payload: ListWorktreesParams,
    success: Schema.Array(Worktree),
  }),
  Rpc.make("removeWorktree", {
    error: GitOperationError,
    payload: RemoveWorktreeParams,
    success: Schema.Void,
  }),
) {}
