import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  /**
   * `push` are nevoie de SESSION mode (portul 5432): schimbă schema, ia lock-uri
   * consultative și ține starea pe sesiune — lucruri pe care transaction mode
   * (6543, portul aplicației) nu le păstrează între interogări.
   */
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
  // Prototip: schema se împinge direct, fără migrări numerotate. Vezi CLAUDE.md.
  strict: false,
  verbose: true,
});
