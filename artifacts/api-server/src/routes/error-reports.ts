import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, programSchoolsTable, programErrorReportsTable } from "@workspace/db";
import { CreateErrorReportBody, CreateErrorReportResponse } from "@workspace/api-zod";

const router: IRouter = Router();

/** Issue types whose report is not useful without the tester explaining what's wrong. */
const DESCRIPTION_REQUIRED = new Set(["wrong_prerequisite_courses", "other"]);

const HTTP_URL = /^https?:\/\//i;

router.post("/error-reports", async (req, res): Promise<void> => {
  const parsed = CreateErrorReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;

  if (DESCRIPTION_REQUIRED.has(body.issueType) && !body.description?.trim()) {
    res.status(400).json({ error: `A short explanation is required for issue type "${body.issueType}"` });
    return;
  }
  if (body.reportedSourceUrl && !HTTP_URL.test(body.reportedSourceUrl)) {
    res.status(400).json({ error: "reportedSourceUrl must be a valid http(s) URL" });
    return;
  }
  if (body.suggestedSourceUrl && !HTTP_URL.test(body.suggestedSourceUrl)) {
    res.status(400).json({ error: "suggestedSourceUrl must be a valid http(s) URL" });
    return;
  }
  if (body.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail)) {
    res.status(400).json({ error: "contactEmail must be a valid email address" });
    return;
  }

  if (body.programId != null) {
    const [program] = await db
      .select({ id: programSchoolsTable.id })
      .from(programSchoolsTable)
      .where(eq(programSchoolsTable.id, body.programId));
    if (!program) {
      res.status(400).json({ error: `No program with id ${body.programId}` });
      return;
    }
  }

  // req.userId is set by requireAuth (gates every route this router is mounted behind) —
  // the Clerk user id, never a session token, kept only for anti-abuse/duplicate tracking
  // and never returned to any client.
  const [row] = await db
    .insert(programErrorReportsTable)
    .values({
      programId: body.programId ?? null,
      profession: body.profession ?? null,
      institution: body.institution ?? null,
      programName: body.programName ?? null,
      programDegree: body.programDegree ?? null,
      reportedSourceUrl: body.reportedSourceUrl ?? null,
      suggestedSourceUrl: body.suggestedSourceUrl ?? null,
      issueType: body.issueType,
      description: body.description?.trim() || null,
      contactEmail: body.contactEmail ?? null,
      reporterUserId: req.userId!,
    })
    .returning();

  res.status(201).json(
    CreateErrorReportResponse.parse({
      id: row.id,
      programId: row.programId,
      profession: row.profession,
      institution: row.institution,
      programName: row.programName,
      programDegree: row.programDegree,
      reportedSourceUrl: row.reportedSourceUrl,
      suggestedSourceUrl: row.suggestedSourceUrl,
      issueType: row.issueType,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
    }),
  );
});

export default router;
