import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Tab, TabCreate, TabUpdate } from "../schemas";

describe("Tab", () => {
  it("decodes a full row", () => {
    const result = Schema.decodeUnknownSync(Tab)({
      id: 1,
      session_id: "s1",
      cwd: "/path",
      git_branch: "main",
      display_label: "my tab",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    });
    expect(result.id).toBe(1);
    expect(result.session_id).toBe("s1");
    expect(result.cwd).toBe("/path");
    expect(result.git_branch).toBe("main");
    expect(result.display_label).toBe("my tab");
  });

  it("decodes with null optional fields", () => {
    const result = Schema.decodeUnknownSync(Tab)({
      id: 1,
      session_id: null,
      cwd: "/path",
      git_branch: null,
      display_label: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    });
    expect(result.session_id).toBeNull();
    expect(result.git_branch).toBeNull();
    expect(result.display_label).toBeNull();
  });
});

describe("TabCreate", () => {
  it("decodes with required fields only", () => {
    const result = Schema.decodeUnknownSync(TabCreate)({ cwd: "/path" });
    expect(result.cwd).toBe("/path");
    expect(result.session_id).toBeUndefined();
    expect(result.git_branch).toBeUndefined();
    expect(result.display_label).toBeUndefined();
  });

  it("decodes with all optional fields", () => {
    const result = Schema.decodeUnknownSync(TabCreate)({
      cwd: "/path",
      session_id: "s1",
      git_branch: "main",
      display_label: "label",
    });
    expect(result.cwd).toBe("/path");
    expect(result.session_id).toBe("s1");
    expect(result.git_branch).toBe("main");
    expect(result.display_label).toBe("label");
  });
});

describe("TabUpdate", () => {
  it("decodes with empty object", () => {
    const result = Schema.decodeUnknownSync(TabUpdate)({});
    expect(result.cwd).toBeUndefined();
    expect(result.session_id).toBeUndefined();
  });

  it("decodes with partial fields", () => {
    const result = Schema.decodeUnknownSync(TabUpdate)({
      cwd: "/new-path",
      git_branch: "feature",
    });
    expect(result.cwd).toBe("/new-path");
    expect(result.git_branch).toBe("feature");
    expect(result.display_label).toBeUndefined();
  });
});
