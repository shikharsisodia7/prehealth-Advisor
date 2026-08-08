// Vercel serverless entry point. Reuses the existing Express app (routes,
// CORS, JSON parsing) as-is — an Express app instance is a valid Node.js
// request handler, so Vercel can invoke it directly without a separate
// adapter.
//
// This imports the pre-built dist/app.mjs (produced by
// artifacts/api-server/build.mjs, run as part of the Vercel buildCommand)
// rather than the raw TypeScript source: it is already a single bundled,
// dependency-resolved JS file, so Vercel's function bundler only has to
// trace one file instead of resolving workspace TypeScript packages and
// their own tsconfig across package boundaries.
//
// Local dev still uses artifacts/api-server/src/index.ts, which wraps the
// same app.ts with app.listen().
// @ts-expect-error -- build output, no .d.ts; see artifacts/api-server/src/app.ts for the real type.
import app from "../artifacts/api-server/dist/app.mjs";

export default app;
