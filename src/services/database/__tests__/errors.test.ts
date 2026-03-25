import { describe, expect, it } from "vitest";
import {
  DatabaseCorruptionError,
  DatabaseOpenError,
  DatabaseQueryError,
  formatDatabaseError,
} from "../errors";

describe("DatabaseOpenError", () => {
  it("has correct _tag and fields", () => {
    const err = new DatabaseOpenError({
      message: "cannot open",
      cause: "SQLITE_CANTOPEN",
    });
    expect(err._tag).toBe("DatabaseOpenError");
    expect(err.message).toBe("cannot open");
    expect(err.cause).toBe("SQLITE_CANTOPEN");
  });
});

describe("DatabaseCorruptionError", () => {
  it("has correct _tag and fields", () => {
    const err = new DatabaseCorruptionError({
      message: "integrity check failed",
    });
    expect(err._tag).toBe("DatabaseCorruptionError");
    expect(err.message).toBe("integrity check failed");
  });
});

describe("DatabaseQueryError", () => {
  it("has correct _tag and fields", () => {
    const err = new DatabaseQueryError({
      message: "query failed",
      cause: "SQLITE_ERROR",
    });
    expect(err._tag).toBe("DatabaseQueryError");
    expect(err.message).toBe("query failed");
    expect(err.cause).toBe("SQLITE_ERROR");
  });
});

describe("formatDatabaseError", () => {
  it("formats DatabaseOpenError correctly", () => {
    const err = new DatabaseOpenError({
      message: "fail",
      cause: "err",
    });
    expect(formatDatabaseError(err)).toBe("Failed to open database: fail");
  });

  it("formats DatabaseCorruptionError correctly", () => {
    const err = new DatabaseCorruptionError({ message: "bad" });
    expect(formatDatabaseError(err)).toBe(
      "Database corruption detected: bad",
    );
  });

  it("formats DatabaseQueryError correctly", () => {
    const err = new DatabaseQueryError({
      message: "fail",
      cause: "err",
    });
    expect(formatDatabaseError(err)).toBe("Database query failed: fail");
  });
});
