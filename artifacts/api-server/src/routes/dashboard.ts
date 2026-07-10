import { Router, type IRouter } from "express";
import { and, asc, gte, isNotNull } from "drizzle-orm";
import {
  db,
  targetSchoolsTable,
  prereqCoursesTable,
  professionsTable,
} from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetUpcomingDeadlinesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [schools, prereqs, professions] = await Promise.all([
    db.select().from(targetSchoolsTable),
    db.select().from(prereqCoursesTable),
    db.select().from(professionsTable),
  ]);

  const professionNameBySlug = new Map(
    professions.map((p) => [p.slug, p.name]),
  );

  const statusMap = new Map<string, number>();
  const professionMap = new Map<string, number>();
  for (const s of schools) {
    statusMap.set(s.status, (statusMap.get(s.status) ?? 0) + 1);
    professionMap.set(
      s.professionSlug,
      (professionMap.get(s.professionSlug) ?? 0) + 1,
    );
  }

  const statusCounts = Array.from(statusMap.entries()).map(
    ([status, count]) => ({ status, count }),
  );
  const professionCounts = Array.from(professionMap.entries()).map(
    ([professionSlug, count]) => ({
      professionSlug,
      professionName: professionNameBySlug.get(professionSlug) ?? professionSlug,
      count,
    }),
  );

  const prereqCompleted = prereqs.filter((p) => p.status === "completed").length;
  const prereqInProgress = prereqs.filter(
    (p) => p.status === "in_progress",
  ).length;

  const summary = {
    totalSchools: schools.length,
    totalProfessionsExplored: professionMap.size,
    prereqTotal: prereqs.length,
    prereqCompleted,
    prereqInProgress,
    statusCounts,
    professionCounts,
  };

  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/dashboard/upcoming-deadlines", async (_req, res): Promise<void> => {
  const now = new Date();
  const rows = await db
    .select()
    .from(targetSchoolsTable)
    .where(
      and(
        isNotNull(targetSchoolsTable.deadline),
        gte(targetSchoolsTable.deadline, now),
      ),
    )
    .orderBy(asc(targetSchoolsTable.deadline))
    .limit(8);

  res.json(
    GetUpcomingDeadlinesResponse.parse(
      rows.map((row) => ({
        ...row,
        deadline: row.deadline ? row.deadline.toISOString() : null,
      })),
    ),
  );
});

export default router;
