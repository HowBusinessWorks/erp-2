import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

declare global {
  var __daminaSql: ReturnType<typeof postgres> | undefined;
}

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL lipsește. Copiază .env.local.example în .env.local și pune conexiunea Supabase.",
    );
  }

  // Capcana care ne-a costat o sesiune — vezi PROGRESS.md §5.
  if (/:5432\//.test(url)) {
    console.warn(
      "[db] DATABASE_URL folosește portul 5432 (session mode), plafonat la 15 conexiuni. " +
        "Aplicația trebuie să meargă pe 6543 (transaction mode). 5432 rămâne doar pentru " +
        "DIRECT_URL, folosit de drizzle-kit push.",
    );
  }

  return url;
}

/**
 * O singură conexiune, refolosită între hot-reload-uri.
 *
 * Cache-ul stă pe `globalThis` în TOATE mediile, nu doar în dezvoltare. Next.js
 * încarcă modulul o dată per graf de module — server components, acțiuni de server,
 * fiecare reîncărcare Turbopack — iar fiecare instanță și-ar deschide propriul bazin.
 * Trei instanțe × 5 conexiuni = exact plafonul de 15 al pooler-ului, adică eroarea
 * `EMAXCONNSESSION`. Globalul e singurul lucru pe care instanțele îl împart.
 *
 * Fără roluri Postgres, fără RLS — permisiunile se verifică în lib/permissions.ts.
 */
const sql =
  globalThis.__daminaSql ??
  postgres(connectionString(), {
    /**
     * Pe transaction mode (6543), conexiunea se întoarce în bazin după fiecare
     * tranzacție, iar pooler-ul acceptă sute de clienți — plafonul de 15 era al
     * lui 5432. Aici limita are alt rol: un `max` prea mic nu mai dă eroare, dar
     * pune cererile la coadă. Cu 3, o rafală de 30 de cereri a stat 10 minute.
     */
    max: 10,
    /** o conexiune nefolosită 20s se închide singură, nu ține loc degeaba */
    idle_timeout: 20,
    /** reciclare la 30 de minute, ca să nu rămână conexiuni zombie după un deploy */
    max_lifetime: 60 * 30,
    connect_timeout: 15,
    /** obligatoriu pe transaction mode: pooler-ul nu ține statement-uri pregătite */
    prepare: false,
    onnotice: () => {},
  });

globalThis.__daminaSql = sql;

export const db = drizzle(sql, { schema });
export { schema, sql };
