/**
 * Developer maintenance tool for closing a pilot "Report an Error" submission.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx src/resolve-error-report.ts <report-id> "<resolution note>"
 *   pnpm --filter @workspace/scripts exec tsx src/resolve-error-report.ts <report-id> "<note>" --dismiss
 */
import { eq } from "drizzle-orm";
import { db, programErrorReportsTable } from "@workspace/db";

const DISMISS = process.argv.includes("--dismiss");
const args = process.argv.slice(2).filter((a) => a !== "--dismiss");
const [idArg, note] = args;
const id = Number(idArg);

if (!idArg || !Number.isInteger(id) || id <= 0 || !note) {
  console.error('Usage: tsx src/resolve-error-report.ts <report-id> "<resolution note>" [--dismiss]');
  process.exit(1);
}

const [existing] = await db
  .select()
  .from(programErrorReportsTable)
  .where(eq(programErrorReportsTable.id, id));

if (!existing) {
  console.error(`No error report with id ${id}`);
  process.exit(1);
}
if (existing.status !== "open") {
  console.log(`Report ${id} is already "${existing.status}" (resolved at ${existing.resolvedAt}). Not re-resolving.`);
  process.exit(0);
}

const status = DISMISS ? "dismissed" : "resolved";
await db
  .update(programErrorReportsTable)
  .set({ status, resolvedAt: new Date(), resolutionNote: note })
  .where(eq(programErrorReportsTable.id, id));

const [check] = await db
  .select()
  .from(programErrorReportsTable)
  .where(eq(programErrorReportsTable.id, id));

if (check?.status !== status) {
  throw new Error(`READ-BACK FAILED for report ${id}: status=${check?.status}`);
}
console.log(`OK report ${id} marked "${status}": ${note}`);
process.exit(0);
