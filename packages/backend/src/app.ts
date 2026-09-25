import { Hono } from "hono";

import { adminRoutes } from "./routes/admin";
import { analyticsRoutes } from "./routes/analytics";
import { contentRoutes } from "./routes/content";
import { statsRoutes } from "./routes/stats";
import type { AppEnv } from "./types";

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get("/health", (c) => c.text("OK"));
  app.route("/api/analytics", analyticsRoutes);
  app.route("/api/stats", statsRoutes);
  app.route("/api", contentRoutes);
  app.route("/api/admin", adminRoutes);
  return app;
}

export const app = createApp();
