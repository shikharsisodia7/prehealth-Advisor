import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, professionsTable } from "@workspace/db";
import {
  ListProfessionsResponse,
  GetProfessionParams,
  GetProfessionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/professions", async (_req, res): Promise<void> => {
  const professions = await db
    .select()
    .from(professionsTable)
    .orderBy(professionsTable.id);
  res.json(ListProfessionsResponse.parse(professions));
});

router.get("/professions/:slug", async (req, res): Promise<void> => {
  const params = GetProfessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [profession] = await db
    .select()
    .from(professionsTable)
    .where(eq(professionsTable.slug, params.data.slug));

  if (!profession) {
    res.status(404).json({ error: "Profession not found" });
    return;
  }

  res.json(GetProfessionResponse.parse(profession));
});

export default router;
