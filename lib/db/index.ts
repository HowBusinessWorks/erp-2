import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __daminaSql: ReturnType<typeof postgres> | undefined;
}

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL lipsește. Copiază .env.local.example în .env.local și pune conexiunea Supabase.",
    );
  }
  return url;
}

/**
 * O singură conexiune, refolosită între hot-reload-uri.
 * Fără roluri Postgres, fără RLS — permisiunile se verifică în lib/permissions.ts.
 */
const sql =
  globalThis.__daminaSql ??
  postgres(connectionString(), {
    max: 5,
    prepare: false,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== "production") globalThis.__daminaSql = sql;

export const db = drizzle(sql, { schema });
export { schema, sql };
