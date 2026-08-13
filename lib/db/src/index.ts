import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon pooler connections can drop idle sockets; allow the pool to recover.
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 20_000,
  keepAlive: true,
});
pool.on("error", (err) => {
  // Prevent idle client errors from crashing long-running workers.
  console.warn(`postgres pool error (non-fatal): ${err.message}`);
});
export const db = drizzle(pool, { schema });

export * from "./schema";
