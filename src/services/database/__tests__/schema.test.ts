import { describe, expect, it } from "vitest";
import {
  EVENTS_SESSION_INDEX_SQL,
  EVENTS_TABLE_SQL,
  TABS_TABLE_SQL,
} from "../schema";

describe("EVENTS_TABLE_SQL", () => {
  it("contains CREATE TABLE IF NOT EXISTS events", () => {
    expect(EVENTS_TABLE_SQL).toContain("CREATE TABLE IF NOT EXISTS events");
  });

  it("contains all required columns", () => {
    expect(EVENTS_TABLE_SQL).toContain("session_id");
    expect(EVENTS_TABLE_SQL).toContain("sequence_number");
    expect(EVENTS_TABLE_SQL).toContain("event_type");
    expect(EVENTS_TABLE_SQL).toContain("event_data");
    expect(EVENTS_TABLE_SQL).toContain("created_at");
  });

  it("contains UNIQUE(session_id, sequence_number) constraint", () => {
    expect(EVENTS_TABLE_SQL).toContain("UNIQUE(session_id, sequence_number)");
  });
});

describe("TABS_TABLE_SQL", () => {
  it("contains CREATE TABLE IF NOT EXISTS tabs", () => {
    expect(TABS_TABLE_SQL).toContain("CREATE TABLE IF NOT EXISTS tabs");
  });

  it("contains all required columns", () => {
    expect(TABS_TABLE_SQL).toContain("session_id");
    expect(TABS_TABLE_SQL).toContain("cwd");
    expect(TABS_TABLE_SQL).toContain("git_branch");
    expect(TABS_TABLE_SQL).toContain("display_label");
    expect(TABS_TABLE_SQL).toContain("created_at");
    expect(TABS_TABLE_SQL).toContain("updated_at");
  });

  it("does not contain tab_order column", () => {
    expect(TABS_TABLE_SQL).not.toContain("tab_order");
  });

  it("does not contain is_active column", () => {
    expect(TABS_TABLE_SQL).not.toContain("is_active");
  });
});

describe("EVENTS_SESSION_INDEX_SQL", () => {
  it("contains CREATE INDEX IF NOT EXISTS", () => {
    expect(EVENTS_SESSION_INDEX_SQL).toContain("CREATE INDEX IF NOT EXISTS");
  });
});
