import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Project, ProjectCreate } from "../schemas";

describe("Project schema", () => {
  it("decodes a valid row with is_git_repo as 1 to true", () => {
    const row = {
      created_at: "2026-01-01 00:00:00",
      directory: "/home/user/project",
      id: 1,
      is_git_repo: 1,
      name: "my-project",
      updated_at: "2026-01-01 00:00:00",
      worktree_base_path: null,
    };
    const result = Schema.decodeUnknownSync(Project)(row);
    expect(result.is_git_repo).toBe(true);
    expect(result.id).toBe(1);
    expect(result.name).toBe("my-project");
    expect(result.directory).toBe("/home/user/project");
    expect(result.worktree_base_path).toBeNull();
  });

  it("decodes a valid row with is_git_repo as 0 to false", () => {
    const row = {
      created_at: "2026-01-01 00:00:00",
      directory: "/home/user/project",
      id: 2,
      is_git_repo: 0,
      name: "plain-project",
      updated_at: "2026-01-01 00:00:00",
      worktree_base_path: null,
    };
    const result = Schema.decodeUnknownSync(Project)(row);
    expect(result.is_git_repo).toBe(false);
  });

  it("decodes a row with worktree_base_path set", () => {
    const row = {
      created_at: "2026-01-01 00:00:00",
      directory: "/home/user/project",
      id: 3,
      is_git_repo: 1,
      name: "git-project",
      updated_at: "2026-01-01 00:00:00",
      worktree_base_path: "/home/user/.worktrees",
    };
    const result = Schema.decodeUnknownSync(Project)(row);
    expect(result.worktree_base_path).toBe("/home/user/.worktrees");
  });
});

describe("ProjectCreate schema", () => {
  it("decodes with required fields only", () => {
    const input = {
      directory: "/home/user/project",
      is_git_repo: true,
      name: "my-project",
    };
    const result = Schema.decodeUnknownSync(ProjectCreate)(input);
    expect(result.name).toBe("my-project");
    expect(result.directory).toBe("/home/user/project");
    expect(result.is_git_repo).toBe(true);
  });

  it("decodes with optional worktree_base_path", () => {
    const input = {
      directory: "/home/user/project",
      is_git_repo: false,
      name: "my-project",
      worktree_base_path: "/home/user/.worktrees",
    };
    const result = Schema.decodeUnknownSync(ProjectCreate)(input);
    expect(result.worktree_base_path).toBe("/home/user/.worktrees");
  });
});
