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

// Must run before the body parsers below: frontendApiProxy forwards the raw
// request body (as a stream) straight through to Clerk's real API for any
// /__clerk/* request. express.json()/urlencoded() read (and drain) that same
// stream into req.body, so if they ran first the proxied request would reach
// Clerk with an empty body — which is exactly what caused a content-length:0
// "Redirect url mismatch" 400 on every OAuth sign-in attempt. frontendApiProxy
// never calls next() for a matching path, so this ordering costs nothing for
// /api/* routes, which still reach the parsers below as before.
//
// Production runs on a Vercel-assigned domain (no custom domain configured in
// Clerk), so the Frontend API is reverse-proxied through this app's own
// /__clerk path.
app.use(clerkMiddleware({ frontendApiProxy: { enabled: true } }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
