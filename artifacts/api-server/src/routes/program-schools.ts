import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import {
  ListProgramSchoolsQueryParams,
  ListProgramSchoolsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Serialize a row: Drizzle returns `date` columns as strings (YYYY-MM-DD).
// Cast to string | null to satisfy the generated zod.string().nullish() schema.
function serialize(row: typeof programSchoolsTable.$inferSelect) {
  return {
    ...row,
    lastVerified: row.lastVerified ?? null,
  };
}

router.get("/program-schools", async (req, res): Promise<void> => {
  // Express parses a single ?degreeType=ABSN as a string and multiple
  // ?degreeType=ABSN&degreeType=MEPN as string[].  Zod always expects an array,
  // so normalise to string[] before validation.
  const rawQuery = {
    ...req.query,
    ...(req.query.degreeType !== undefined
      ? { degreeType: ([] as string[]).concat(req.query.degreeType as string | string[]) }
      : {}),
  };
  const query = ListProgramSchoolsQueryParams.safeParse(rawQuery);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { professionSlug, degreeType: degreeTypeParam } = query.data;

  // Server-side enforcement: nursing always scoped to entry-to-practice degrees.
  // If the caller omits degreeType when querying nursing, apply the default.
  const effectiveDegreeTypes =
    degreeTypeParam && degreeTypeParam.length > 0
      ? degreeTypeParam
      : professionSlug === "nursing"
        ? ["ABSN", "MEPN"]
        : undefined;

  const rows = await db
    .select()
    .from(programSchoolsTable)
    .where(
      and(
        professionSlug ? eq(programSchoolsTable.professionSlug, professionSlug) : undefined,
        effectiveDegreeTypes ? inArray(programSchoolsTable.degreeType, effectiveDegreeTypes) : undefined,
      ),
    )
    .orderBy(programSchoolsTable.name);

  res.json(ListProgramSchoolsResponse.parse(rows.map(serialize)));
});

export default router;
