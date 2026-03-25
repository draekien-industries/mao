import type { SqlClient } from "@effect/sql";
import { Context } from "effect";

export class Database extends Context.Tag("Database")<
  Database,
  {
    readonly sql: SqlClient.SqlClient;
  }
>() {}
