import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, prereqCoursesTable } from "@workspace/db";
import {
  ListPrereqCoursesQueryParams,
  ListPrereqCoursesResponse,
  CreatePrereqCourseBody,
  CreatePrereqCourseResponse,
  UpdatePrereqCourseParams,
  UpdatePrereqCourseBody,
  UpdatePrereqCourseResponse,
  DeletePrereqCourseParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/prereq-courses", async (req, res): Promise<void> => {
  const query = ListPrereqCoursesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(prereqCoursesTable)
    .where(
      query.data.professionSlug
        ? eq(prereqCoursesTable.professionSlug, query.data.professionSlug)
        : undefined,
    )
    .orderBy(desc(prereqCoursesTable.createdAt));

  res.json(ListPrereqCoursesResponse.parse(rows));
});

router.post("/prereq-courses", async (req, res): Promise<void> => {
  const parsed = CreatePrereqCourseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .insert(prereqCoursesTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(CreatePrereqCourseResponse.parse(row));
});

router.patch("/prereq-courses/:id", async (req, res): Promise<void> => {
  const params = UpdatePrereqCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePrereqCourseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .update(prereqCoursesTable)
    .set(parsed.data)
    .where(eq(prereqCoursesTable.id, params.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Prerequisite course not found" });
    return;
  }

  res.json(UpdatePrereqCourseResponse.parse(row));
});

router.delete("/prereq-courses/:id", async (req, res): Promise<void> => {
  const params = DeletePrereqCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .delete(prereqCoursesTable)
    .where(eq(prereqCoursesTable.id, params.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Prerequisite course not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
