import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

let mockAuth: { userId: string | null } = { userId: "user_test_1" };
let selectResult: Array<{ id: number }> = [{ id: 42 }];
let insertedValues: any[] = [];
let insertReturning: any = null;

vi.mock("@clerk/express", () => ({
  getAuth: () => mockAuth,
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => selectResult,
      }),
    }),
    insert: () => ({
      values: (v: any) => {
        insertedValues.push(v);
        return {
          returning: async () => [
            insertReturning ?? {
              id: 1,
              programId: v.programId,
              profession: v.profession,
              institution: v.institution,
              programName: v.programName,
              programDegree: v.programDegree,
              reportedSourceUrl: v.reportedSourceUrl,
              suggestedSourceUrl: v.suggestedSourceUrl,
              issueType: v.issueType,
              description: v.description,
              status: "open",
              reporterUserId: v.reporterUserId,
              contactEmail: v.contactEmail,
              createdAt: new Date("2026-09-04T00:00:00Z"),
            },
          ],
        };
      },
    }),
  },
  programSchoolsTable: { id: "id" },
  programErrorReportsTable: {},
}));

const { requireAuth } = await import("../middlewares/requireAuth");
const { default: errorReportsRouter } = await import("./error-reports");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(requireAuth);
  app.use(errorReportsRouter);
  return app;
}

const validBody = {
  issueType: "wrong_program_page",
  profession: "medicine",
  institution: "Test University College of Medicine",
  programName: "Doctor of Medicine (MD)",
  reportedSourceUrl: "https://test.edu/wrong-page",
};

beforeEach(() => {
  mockAuth = { userId: "user_test_1" };
  selectResult = [{ id: 42 }];
  insertedValues = [];
  insertReturning = null;
});

describe("POST /error-reports", () => {
  it("rejects an unauthenticated submission with 401", async () => {
    mockAuth = { userId: null };
    const res = await request(buildApp()).post("/error-reports").send(validBody);
    expect(res.status).toBe(401);
    expect(insertedValues).toHaveLength(0);
  });

  it("accepts a valid authenticated submission", async () => {
    const res = await request(buildApp()).post("/error-reports").send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.issueType).toBe("wrong_program_page");
    expect(res.body.status).toBe("open");
    expect(insertedValues).toHaveLength(1);
  });

  it("rejects an invalid issue type", async () => {
    const res = await request(buildApp())
      .post("/error-reports")
      .send({ ...validBody, issueType: "not_a_real_issue_type" });
    expect(res.status).toBe(400);
    expect(insertedValues).toHaveLength(0);
  });

  it("requires a description for issue type 'other'", async () => {
    const res = await request(buildApp())
      .post("/error-reports")
      .send({ ...validBody, issueType: "other", description: undefined });
    expect(res.status).toBe(400);
    expect(insertedValues).toHaveLength(0);
  });

  it("requires a description for issue type 'wrong_prerequisite_courses'", async () => {
    const res = await request(buildApp())
      .post("/error-reports")
      .send({ ...validBody, issueType: "wrong_prerequisite_courses" });
    expect(res.status).toBe(400);
    expect(insertedValues).toHaveLength(0);
  });

  it("accepts 'other' when a description is provided", async () => {
    const res = await request(buildApp())
      .post("/error-reports")
      .send({ ...validBody, issueType: "other", description: "Something else is wrong with this row." });
    expect(res.status).toBe(201);
  });

  it("rejects an overlong description", async () => {
    const res = await request(buildApp())
      .post("/error-reports")
      .send({ ...validBody, issueType: "other", description: "x".repeat(2001) });
    expect(res.status).toBe(400);
    expect(insertedValues).toHaveLength(0);
  });

  it("rejects an invalid suggestedSourceUrl", async () => {
    const res = await request(buildApp())
      .post("/error-reports")
      .send({ ...validBody, suggestedSourceUrl: "not-a-url" });
    expect(res.status).toBe(400);
    expect(insertedValues).toHaveLength(0);
  });

  it("rejects an invalid reportedSourceUrl", async () => {
    const res = await request(buildApp())
      .post("/error-reports")
      .send({ ...validBody, reportedSourceUrl: "javascript:alert(1)" });
    expect(res.status).toBe(400);
    expect(insertedValues).toHaveLength(0);
  });

  it("rejects an invalid contactEmail when provided", async () => {
    const res = await request(buildApp())
      .post("/error-reports")
      .send({ ...validBody, contactEmail: "not-an-email" });
    expect(res.status).toBe(400);
    expect(insertedValues).toHaveLength(0);
  });

  it("accepts a submission with no contactEmail — it is optional", async () => {
    const res = await request(buildApp()).post("/error-reports").send(validBody);
    expect(res.status).toBe(201);
    expect(insertedValues[0].contactEmail).toBeNull();
  });

  it("rejects a programId that does not exist", async () => {
    selectResult = [];
    const res = await request(buildApp())
      .post("/error-reports")
      .send({ ...validBody, programId: 999999 });
    expect(res.status).toBe(400);
    expect(insertedValues).toHaveLength(0);
  });

  it("accepts a programId that does exist", async () => {
    selectResult = [{ id: 547 }];
    const res = await request(buildApp())
      .post("/error-reports")
      .send({ ...validBody, programId: 547 });
    expect(res.status).toBe(201);
    expect(insertedValues[0].programId).toBe(547);
  });

  it("associates the report with the authenticated user's id, and stores no token or session", () => {
    return request(buildApp())
      .post("/error-reports")
      .send(validBody)
      .then(() => {
        expect(insertedValues[0].reporterUserId).toBe("user_test_1");
        const stored = JSON.stringify(insertedValues[0]);
        expect(stored).not.toMatch(/session/i);
        expect(stored).not.toMatch(/token/i);
      });
  });

  it("does not require a programId — the first-page entry point has no program yet", async () => {
    const res = await request(buildApp())
      .post("/error-reports")
      .send({ issueType: "program_missing", institution: "Some University", description: undefined });
    expect(res.status).toBe(201);
  });
});
