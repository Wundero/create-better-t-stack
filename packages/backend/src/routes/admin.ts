import { AnalyticsEventSchema } from "@better-t-stack/types";
import { Hono } from "hono";

import { applyEventsToStats } from "../analytics/ingest";
import { rowToEvent } from "../db/mapping";
import type { AnalyticsEventRow, AppEnv } from "../types";

export const adminRoutes = new Hono<AppEnv>();

/**
 * Admin surface. Fail-closed: when `ADMIN_TOKEN` is unset the whole group
 * returns 404, so no destructive route is reachable in the default deployment.
 */
adminRoutes.use("*", async (c, next) => {
  const token = c.env.ADMIN_TOKEN;
  if (!token) return c.notFound();
  const header = c.req.header("authorization") ?? "";
  if (header !== `Bearer ${token}`) return c.text("Unauthorized", 401);
  await next();
});

/**
 * Quarantines events that fail the current ingestion schema and reverses every
 * aggregate they contributed to (mirrors the former Convex repair action).
 * `dryRun` reports without mutating.
 */
adminRoutes.post("/quarantine", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { dryRun?: boolean };
  const dryRun = body.dryRun === true;
  const db = c.env.DB;

  const rows = await db
    .prepare("SELECT * FROM analytics_events ORDER BY id ASC")
    .all<AnalyticsEventRow>();
  const invalid = rows.results.filter(
    (row) =>
      row.quarantined_at === null && !AnalyticsEventSchema.safeParse(rowToEvent(row)).success,
  );

  if (!dryRun && invalid.length > 0) {
    const events = invalid.map((row) => ({ event: rowToEvent(row), creationTime: row.created_at }));
    await applyEventsToStats(db, events, -1, Date.now(), { legacyVersionKeys: true });

    const quarantinedAt = Date.now();
    for (const row of invalid) {
      const date = new Date(row.created_at).toISOString().slice(0, 10);
      const daily = await db
        .prepare("SELECT count FROM analytics_daily_stats WHERE date = ?")
        .bind(date)
        .first<{ count: number }>();
      if (!daily || daily.count < 1) {
        throw new Error(`Cannot safely decrement analytics for ${date}`);
      }
      await db
        .prepare("UPDATE analytics_daily_stats SET count = count - 1 WHERE date = ?")
        .bind(date)
        .run();
      await db
        .prepare(
          "UPDATE analytics_events SET quarantined_at = ?, quarantine_reason = 'invalid_payload' WHERE id = ?",
        )
        .bind(quarantinedAt, row.id)
        .run();
    }
  }

  return c.json({
    scanned: rows.results.length,
    invalid: invalid.length,
    quarantined: dryRun ? 0 : invalid.length,
  });
});
