import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// drizzle-kit's schema-file glob (fast-glob) requires forward slashes even on
// Windows; path.join produces backslashes there, which silently matches zero
// files instead of erroring clearly.
const schemaPath = path.join(__dirname, "./src/schema/index.ts").split(path.sep).join("/");

export default defineConfig({
  schema: schemaPath,
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
