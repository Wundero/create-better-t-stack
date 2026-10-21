import { AnalyticsEventSchema } from "@better-t-stack/types";
import { Hono } from "hono";

import { ingestEvent } from "../analytics/ingest";
import {
  getDailyStats,
  getMonthlyStats,
  getRecentEvents,
  loadStats,
  sanitizeDays,
  sanitizeLimit,
} from "../db/analytics";
import type { AppEnv } from "../types";

const MAX_ANALYTICS_PAYLOAD_BYTES = 16 * 1024;
const encoder = new TextEncoder();

export const analyticsRoutes = new Hono<AppEnv>();

analyticsRoutes.post("/ingest", async (c) => {
  const declaredLength = Number(c.req.header("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ANALYTICS_PAYLOAD_BYTES) {
    return c.text("Payload Too Large", 413);
  }

  let rawBody: string;
  try {
    rawBody = await c.req.text();
  } catch {
    return c.text("Bad Request", 400);
  }
  if (encoder.encode(rawBody).byteLength > MAX_ANALYTICS_PAYLOAD_BYTES) {
    return c.text("Payload Too Large", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.text("Bad Request", 400);
  }

  const parsed = AnalyticsEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.text("Bad Request", 400);
  }

  try {
    const createdAt = c.env.now?.() ?? Date.now();
    await ingestEvent(c.env.DB, parsed.data, createdAt);
  } catch (error) {
    console.error("Failed to ingest analytics:", error);
    return c.text("Internal Server Error", 500);
  }

  return c.text("ok");
});

analyticsRoutes.get("/stats", async (c) => {
  const stats = await loadStats(c.env.DB);
  return c.json(stats);
});

analyticsRoutes.get("/daily", async (c) => {
  const days = sanitizeDays(Number(c.req.query("days")));
  return c.json(await getDailyStats(c.env.DB, days));
});

analyticsRoutes.get("/monthly", async (c) => {
  return c.json(await getMonthlyStats(c.env.DB));
});

analyticsRoutes.get("/recent", async (c) => {
  const limit = sanitizeLimit(Number(c.req.query("limit")));
  return c.json(await getRecentEvents(c.env.DB, limit));
});
