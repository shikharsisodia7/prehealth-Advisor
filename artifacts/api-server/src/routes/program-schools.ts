import { Router, type IRouter } from "express";
import { and, eq, ne, inArray } from "drizzle-orm";
import { db, programSchoolsTable } from "@workspace/db";
import {
  ListProgramSchoolsQueryParams,
  ListProgramSchoolsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Serialize a row: ensure nullable columns are null (not undefined) for Zod.
function serialize(row: typeof programSchoolsTable.$inferSelect) {
  return {
    ...row,
    lastVerified: row.lastVerified ?? null,
    city: row.city ?? null,
    degreeType: row.degreeType ?? null,
    sourceUrl: row.sourceUrl ?? null,
    websiteUrl: row.websiteUrl ?? null,
  };
}

router.get("/program-schools", async (req, res): Promise<void> => {
  // Express parses a single ?degreeType=ABSN as a string and multiple
  // ?degreeType=ABSN&degreeType=MEPN as string[]. Zod always expects an array,
  // so normalise to string[] before validation.
  const rawQuery = {
    ...req.query,
    ...(req.query.degreeType !== undefined
      ? {
          degreeType: ([] as string[]).concat(
            req.query.degreeType as string | string[],
          ),
        }
      : {}),
  };
  const query = ListProgramSchoolsQueryParams.safeParse(rawQuery);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { professionSlug, degreeType: degreeTypeParam } = query.data;

  // Server-side enforcement: nursing is always scoped to entry-to-practice
  // degrees (ABSN and MEPN). We intersect any caller-provided degreeType
  // values with this allowlist so that explicit ?degreeType=BSN (or any other
  // non-entry degree) cannot bypass the rule.
  //
  // Resolution table:
  //   nursing + no param         → ["ABSN","MEPN"]  (default set)
  //   nursing + ["ABSN"]         → ["ABSN"]          (subset of allowlist)
  //   nursing + ["MEPN"]         → ["MEPN"]          (subset of allowlist)
  //   nursing + ["ABSN","MEPN"]  → ["ABSN","MEPN"]   (full allowlist)
  //   nursing + ["BSN"]          → []                 (empty — returns no rows;
  //                                                    callers should not send
  //                                                    invalid types but we
  //                                                    return empty rather than
  //                                                    exposing disallowed data)
  //   other profession + param   → caller param (pass-through, no allowlist)
  //   other profession + no param→ undefined          (no filter)
  const NURSING_ALLOWED = ["ABSN", "MEPN"] as const;

  let effectiveDegreeTypes: string[] | undefined;
  if (professionSlug === "nursing") {
    const callerTypes =
      degreeTypeParam && degreeTypeParam.length > 0 ? degreeTypeParam : null;
    effectiveDegreeTypes = callerTypes
      ? callerTypes.filter((t) =>
          (NURSING_ALLOWED as readonly string[]).includes(t),
        )
      : [...NURSING_ALLOWED];
  } else {
    effectiveDegreeTypes =
      degreeTypeParam && degreeTypeParam.length > 0
        ? degreeTypeParam
        : undefined;
  }

  const rows = await db
    .select()
    .from(programSchoolsTable)
    .where(
      and(
        professionSlug
          ? eq(programSchoolsTable.professionSlug, professionSlug)
          : undefined,
        effectiveDegreeTypes
          ? inArray(programSchoolsTable.degreeType, effectiveDegreeTypes)
          : undefined,
        // Directory listing rule: inactive programs (closed / no longer
        // accredited) are hidden. Programs are listed regardless of
        // prerequisite verification status — existence and prereq data are
        // separate concerns.
        ne(programSchoolsTable.directoryStatus, "inactive"),
      ),
    )
    .orderBy(programSchoolsTable.name);

  res.json(ListProgramSchoolsResponse.parse(rows.map(serialize)));
});

export default router;
