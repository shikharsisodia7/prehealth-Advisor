import { Router, type IRouter } from "express";
import healthRouter from "./health";
import professionsRouter from "./professions";
import targetSchoolsRouter from "./target-schools";
import prereqCoursesRouter from "./prereq-courses";
import dashboardRouter from "./dashboard";
import programSchoolsRouter from "./program-schools";

const router: IRouter = Router();

router.use(healthRouter);
router.use(professionsRouter);
router.use(targetSchoolsRouter);
router.use(prereqCoursesRouter);
router.use(dashboardRouter);
router.use(programSchoolsRouter);

export default router;
