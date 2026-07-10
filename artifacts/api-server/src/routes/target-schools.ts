import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, targetSchoolsTable } from "@workspace/db";
import {
  ListTargetSchoolsQueryParams,
  ListTargetSchoolsResponse,
  CreateTargetSchoolBody,
  CreateTargetSchoolResponse,
  GetTargetSchoolParams,
  GetTargetSchoolResponse,
  UpdateTargetSchoolParams,
  UpdateTargetSchoolBody,
  UpdateTargetSchoolResponse,
  DeleteTargetSchoolParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serialize<T extends { deadline: Date | null }>(row: T) {
  return { ...row, deadline: row.deadline ? row.deadline.toISOString() : null };
}

router.get("/target-schools", async (req, res): Promise<void> => {
  const query = ListTargetSchoolsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.professionSlug) {
    conditions.push(
      eq(targetSchoolsTable.professionSlug, query.data.professionSlug),
    );
  }
  if (query.data.status) {
    conditions.push(eq(targetSchoolsTable.status, query.data.status));
  }

  const rows = await db
    .select()
    .from(targetSchoolsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(targetSchoolsTable.createdAt));

  res.json(ListTargetSchoolsResponse.parse(rows.map(serialize)));
});

router.post("/target-schools", async (req, res): Promise<void> => {
  const parsed = CreateTargetSchoolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { deadline, ...rest } = parsed.data;
  let deadlineDate: Date | null = null;
  if (deadline) {
    deadlineDate = new Date(deadline);
    if (Number.isNaN(deadlineDate.getTime())) {
      res.status(400).json({ error: "Invalid deadline date" });
      return;
    }
  }

  const [row] = await db
    .insert(targetSchoolsTable)
    .values({
      ...rest,
      deadline: deadlineDate,
    })
    .returning();

  res.status(201).json(CreateTargetSchoolResponse.parse(serialize(row)));
});

router.get("/target-schools/:id", async (req, res): Promise<void> => {
  const params = GetTargetSchoolParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(targetSchoolsTable)
    .where(eq(targetSchoolsTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Target school not found" });
    return;
  }

  res.json(GetTargetSchoolResponse.parse(serialize(row)));
});

router.patch("/target-schools/:id", async (req, res): Promise<void> => {
  const params = UpdateTargetSchoolParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTargetSchoolBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { deadline, ...rest } = parsed.data;
  const updateValues: Record<string, unknown> = { ...rest };
  if (deadline !== undefined) {
    if (deadline) {
      const deadlineDate = new Date(deadline);
      if (Number.isNaN(deadlineDate.getTime())) {
        res.status(400).json({ error: "Invalid deadline date" });
        return;
      }
      updateValues.deadline = deadlineDate;
    } else {
      updateValues.deadline = null;
    }
  }

  const [row] = await db
    .update(targetSchoolsTable)
    .set(updateValues)
    .where(eq(targetSchoolsTable.id, params.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Target school not found" });
    return;
  }

  res.json(UpdateTargetSchoolResponse.parse(serialize(row)));
});

router.delete("/target-schools/:id", async (req, res): Promise<void> => {
  const params = DeleteTargetSchoolParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .delete(targetSchoolsTable)
    .where(eq(targetSchoolsTable.id, params.data.id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Target school not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
