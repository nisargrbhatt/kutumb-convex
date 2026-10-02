import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "@/db/schema";

/**
 * Schema-typed async drizzle client. Structural, so both the D1 client and the in-memory sqlite
 * stand-in used in tests satisfy it — keeps query fns free of `cloudflare:workers`.
 */
// oxlint-disable-next-line typescript/no-explicit-any
export type QueryDb = BaseSQLiteDatabase<"async", any, typeof schema>;
