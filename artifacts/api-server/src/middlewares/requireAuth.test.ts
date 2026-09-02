import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

let mockAuth: { userId: string | null } = { userId: null };

vi.mock("@clerk/express", () => ({
  getAuth: () => mockAuth,
}));

const { requireAuth } = await import("./requireAuth");

function buildApp() {
  const app = express();
  app.get("/protected", requireAuth, (req, res) => {
    res.json({ userId: req.userId });
  });
  return app;
}

beforeEach(() => {
  mockAuth = { userId: null };
});

describe("requireAuth", () => {
  it("rejects a signed-out request with 401", async () => {
    mockAuth = { userId: null };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Sign in required" });
  });

  it("allows any signed-in user through — no domain or role restriction", async () => {
    mockAuth = { userId: "user_123" };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: "user_123" });
  });
});
