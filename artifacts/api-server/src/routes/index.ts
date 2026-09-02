import { Router, type IRouter } from "express";
import healthRouter from "./health";
import professionsRouter from "./professions";
import targetSchoolsRouter from "./target-schools";
import prereqCoursesRouter from "./prereq-courses";
import dashboardRouter from "./dashboard";
import programSchoolsRouter from "./program-schools";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Public: health checks must stay reachable without a session.
router.use(healthRouter);

// Everything else is planner data — gated behind sign-in.
router.use(requireAuth);
router.use(professionsRouter);
router.use(targetSchoolsRouter);
router.use(prereqCoursesRouter);
router.use(dashboardRouter);
router.use(programSchoolsRouter);

export default router;
