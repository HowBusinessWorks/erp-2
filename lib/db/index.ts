import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Sql = ReturnType<typeof postgres>;
type Db = ReturnType<typeof makeDb>;

declare global {
  var __daminaPool: { sql: Sql; db: Db } | undefined;
}

/**
 * Cât are voie o interogare să aștepte până declarăm bazinul mort. Interogările
 * reale ale aplicației stau sub o secundă; 20 înseamnă „socket-ul nu mai răspunde",
 * nu „e lent".
 */
const QUERY_TIMEOUT_MS = 20_000;

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

function connect(): Sql {
  return postgres(connectionString(), {
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
    /** keepalive la 15s: un socket rămas pe jumătate deschis moare în ~30s, nu în ore */
    keep_alive: 15,
    /** obligatoriu pe transaction mode: pooler-ul nu ține statement-uri pregătite */
    prepare: false,
    onnotice: () => {},
  });
}

/**
 * Reface bazinul după ce o interogare a expirat.
 *
 * Când rețeaua se schimbă sub noi (Tailscale, sleep, wifi), socket-urile către
 * pooler rămân `ESTABLISHED` local, dar celălalt capăt nu mai există. postgres.js
 * nu are cum să afle: interogarea pleacă și nu se mai întoarce niciodată, iar
 * conexiunea rămâne ocupată. După zece astfel de cereri bazinul e plin de morți
 * și **fiecare** pagină atârnă la infinit — inclusiv login-ul. `cancel()` nu ajută,
 * fiindcă are nevoie de același server ca să răspundă. Singurul leac e să arunci
 * socket-urile și să deschizi altele.
 */
function recycle(dead: Sql) {
  const pool = globalThis.__daminaPool;
  if (!pool || pool.sql !== dead) return; // altcineva a refăcut deja bazinul
  console.warn(
    `[db] nicio interogare nu a răspuns în ${QUERY_TIMEOUT_MS / 1000}s — bazinul de conexiuni ` +
      "se reface. Cauza obișnuită: rețeaua s-a schimbat și socket-urile către pooler au murit.",
  );
  const sql = connect();
  globalThis.__daminaPool = { sql, db: makeDb(sql) };
  dead.end({ timeout: 0 }).catch(() => {});
}

type AnyFn = (...args: unknown[]) => unknown;
type Fulfilled = ((value: unknown) => unknown) | null | undefined;
type Rejected = ((reason: unknown) => unknown) | null | undefined;

/**
 * Îmbracă o interogare postgres.js într-un termen limită. `.values()` și celelalte
 * metode ale ei se întorc pe ele însele, deci reîmbrăcăm rezultatul.
 */
function withDeadline(pending: object, onTimeout: () => void): object {
  let raced: Promise<unknown> | null = null;

  const run = () =>
    (raced ??= new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        onTimeout();
        reject(new Error(`Baza de date nu a răspuns în ${QUERY_TIMEOUT_MS / 1000}s.`));
      }, QUERY_TIMEOUT_MS);
      Promise.resolve(pending).then(
        (value) => (clearTimeout(timer), resolve(value)),
        (error) => (clearTimeout(timer), reject(error)),
      );
    }));

  return new Proxy(pending, {
    get(target, prop) {
      if (prop === "then") return (ok: Fulfilled, err: Rejected) => run().then(ok, err);
      if (prop === "catch") return (err: Rejected) => run().catch(err);
      if (prop === "finally") return (fn: (() => void) | null | undefined) => run().finally(fn);
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const out = (value as AnyFn).apply(target, args);
        return out === target ? withDeadline(target, onTimeout) : out;
      };
    },
  });
}

/** Clientul pe care îl vede drizzle: același, dar cu termen limită pe fiecare interogare. */
function withDeadlines(sql: Sql): Sql {
  const wrap = (out: unknown) =>
    typeof (out as PromiseLike<unknown> | null)?.then === "function"
      ? withDeadline(out as object, () => recycle(sql))
      : out;

  return new Proxy(sql, {
    apply: (target, thisArg, args) => wrap(Reflect.apply(target as AnyFn, thisArg, args)),
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      // `end` și `begin` nu sunt interogări: prima închide bazinul, a doua dă mai
      // departe clientul brut în tranzacție.
      if (prop === "end" || prop === "begin") return value.bind(target);
      return (...args: unknown[]) => wrap((value as AnyFn).apply(target, args));
    },
  }) as Sql;
}

function makeDb(sql: Sql) {
  return drizzle(withDeadlines(sql), { schema });
}

/**
 * Un singur bazin, refolosit între hot-reload-uri.
 *
 * Cache-ul stă pe `globalThis` în TOATE mediile, nu doar în dezvoltare. Next.js
 * încarcă modulul o dată per graf de module — server components, acțiuni de server,
 * fiecare reîncărcare Turbopack — iar fiecare instanță și-ar deschide propriul bazin.
 * Trei instanțe × 5 conexiuni = exact plafonul de 15 al pooler-ului, adică eroarea
 * `EMAXCONNSESSION`. Globalul e singurul lucru pe care instanțele îl împart.
 *
 * `db` și `sql` sunt proxy-uri, nu instanțe: `recycle()` schimbă bazinul de sub ele
 * fără ca cele ~200 de locuri care fac `import { db }` să afle ceva.
 *
 * Fără roluri Postgres, fără RLS — permisiunile se verifică în lib/permissions.ts.
 */
function pool() {
  if (!globalThis.__daminaPool) {
    const sql = connect();
    globalThis.__daminaPool = { sql, db: makeDb(sql) };
  }
  return globalThis.__daminaPool;
}

function live<T extends object>(pick: () => T): T {
  return new Proxy((() => {}) as unknown as T, {
    apply: (_t, thisArg, args) => Reflect.apply(pick() as unknown as AnyFn, thisArg, args),
    get(_t, prop) {
      const target = pick();
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export const db = live<Db>(() => pool().db);
export const sql = live<Sql>(() => pool().sql);
export { schema };
