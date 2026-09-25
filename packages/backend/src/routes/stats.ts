import { Hono } from "hono";

import { readGithub, readNpm } from "../oss-stats";
import type { AppEnv } from "../types";

const MAX_NPM_NAMES = 20;

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.get("/github", async (c) => {
  const name = c.req.query("name");
  if (!name || !/^[^/\s]+\/[^/\s]+$/.test(name)) {
    return c.text("Bad Request", 400);
  }
  const cache = await readGithub(c.env, name);
  return c.json({ starCount: cache.starCount, contributorCount: cache.contributorCount });
});

statsRoutes.get("/npm", async (c) => {
  const names = (c.req.query("names") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .slice(0, MAX_NPM_NAMES);

  const packages = await Promise.all(
    names.map(async (name) => {
      const cache = await readNpm(c.env, name);
      return { name, dayOfWeekAverages: cache.dayOfWeekAverages, total: cache.total };
    }),
  );

  return c.json({ packages });
});
