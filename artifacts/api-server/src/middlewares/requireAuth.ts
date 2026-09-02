import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Gate for the planner/manual-search API. Access is open to any signed-in
 * Clerk user — there is no admin role, no per-user data, and no domain
 * restriction (the professor did not ask for one; see CampusVal's
 * requireAuth.ts, which dropped its @scu.edu gate the same way for the
 * same reason: this tool has no per-institution access requirement).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  req.userId = userId;
  next();
}
