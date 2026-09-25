import { EVENT_INSERT_COLUMNS, eventInsertValues } from "../db/mapping";
import type { StatsRow } from "../types";
import type { AnalyticsEventFields, AnalyticsStatsFields, TimestampedAnalyticsEvent } from "./helpers";
import { adjustAnalyticsStats, createEmptyAnalyticsStats } from "./helpers";

const MAX_UPDATE_ATTEMPTS = 8;
const INSERT_COLUMNS = EVENT_INSERT_COLUMNS.join(", ");
const INSERT_PLACEHOLDERS = EVENT_INSERT_COLUMNS.map(() => "?").join(", ");

/**
 * Applies a batch of events to the single aggregate row with optimistic
 * concurrency control: read `version`, write `data` + `version + 1` guarded by
 * `WHERE version = ?`, retry when another isolate won the race.
 *
 * `delta = -1` is the exact inverse used by quarantine/repair, so it never
 * bumps `lastEventTime`.
 */
export async function applyEventsToStats(
  db: D1Database,
  entries: TimestampedAnalyticsEvent[],
  delta: 1 | -1,
  updatedAt: number,
  options: { legacyVersionKeys?: boolean } = {},
): Promise<void> {
  for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt++) {
    const row = await db
      .prepare("SELECT data, version FROM analytics_stats WHERE id = 1")
      .first<StatsRow>();

    if (!row) {
      if (delta === -1) throw new Error("Cannot decrement missing analytics stats");
      // Seed the row, then loop again to apply the delta against a known version.
      await db
        .prepare(
          "INSERT OR IGNORE INTO analytics_stats (id, data, version, updated_at) VALUES (1, ?, 0, ?)",
        )
        .bind(JSON.stringify(createEmptyAnalyticsStats()), updatedAt)
        .run();
      continue;
    }

    const current = JSON.parse(row.data) as AnalyticsStatsFields;
    const next = adjustAnalyticsStats(current, entries, delta, options);
    const result = await db
      .prepare(
        "UPDATE analytics_stats SET data = ?, version = ?, updated_at = ? WHERE id = 1 AND version = ?",
      )
      .bind(JSON.stringify(next), row.version + 1, updatedAt, row.version)
      .run();

    if (result.meta.changes === 1) return;
  }

  throw new Error("Failed to update analytics stats after concurrent writers");
}

/** Inserts an event, bumps the aggregate, then the per-day counter. */
export async function ingestEvent(
  db: D1Database,
  event: AnalyticsEventFields,
  createdAt: number,
): Promise<void> {
  await db
    .prepare(`INSERT INTO analytics_events (${INSERT_COLUMNS}) VALUES (${INSERT_PLACEHOLDERS})`)
    .bind(...eventInsertValues(event, createdAt))
    .run();

  await applyEventsToStats(db, [{ event, creationTime: createdAt }], 1, createdAt);

  const date = new Date(createdAt).toISOString().slice(0, 10);
  await db
    .prepare(
      "INSERT INTO analytics_daily_stats (date, count) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1",
    )
    .bind(date)
    .run();
}
