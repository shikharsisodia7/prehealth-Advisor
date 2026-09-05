import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Reads CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY from the environment.
// Production runs on a Vercel-assigned domain (no custom domain configured in
// Clerk), so the Frontend API is reverse-proxied through this app's own
// /__clerk path — frontendApiProxy handles those requests directly and never
// calls next(), so it's safe to mount ahead of the /api router.
app.use(clerkMiddleware({ frontendApiProxy: { enabled: true } }));

app.use("/api", router);

export default app;
