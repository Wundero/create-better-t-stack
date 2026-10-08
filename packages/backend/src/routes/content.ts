import { Hono } from "hono";

import { getShowcase, getTweets, getVideos } from "../db/content";
import type { AppEnv } from "../types";

export const contentRoutes = new Hono<AppEnv>();

contentRoutes.get("/showcase", async (c) => c.json(await getShowcase(c.env.DB)));
contentRoutes.get("/videos", async (c) => c.json(await getVideos(c.env.DB)));
contentRoutes.get("/tweets", async (c) => c.json(await getTweets(c.env.DB)));
