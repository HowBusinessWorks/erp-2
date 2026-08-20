import { config } from "dotenv";
config({ path: ".env.local" });

import { sql } from "../lib/db";
import { seedCore } from "./index";
import { seedOperations } from "./operations";

async function run() {
  const started = Date.now();
  const ctx = await seedCore();
  await seedOperations(ctx);
  console.log(`✓ seed complet în ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await sql.end();
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
