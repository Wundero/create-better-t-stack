export type ShowcaseItem = {
  id: string;
  createdAt: number;
  title: string;
  description: string;
  imageUrl: string;
  liveUrl: string;
  tags: string[];
};

export type VideoItem = {
  id: string;
  createdAt: number;
  embedId: string;
  title: string;
};

export type TweetItem = {
  id: string;
  createdAt: number;
  tweetId: string;
  order?: number;
};

export async function getShowcase(db: D1Database): Promise<ShowcaseItem[]> {
  const result = await db
    .prepare(
      "SELECT id, created_at, title, description, image_url, live_url, tags FROM showcase ORDER BY id ASC",
    )
    .all<{
      id: number;
      created_at: number;
      title: string;
      description: string;
      image_url: string;
      live_url: string;
      tags: string;
    }>();
  return result.results.map((row) => ({
    id: String(row.id),
    createdAt: row.created_at,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    liveUrl: row.live_url,
    tags: JSON.parse(row.tags) as string[],
  }));
}

export async function getVideos(db: D1Database): Promise<VideoItem[]> {
  const result = await db
    .prepare("SELECT id, created_at, embed_id, title FROM videos ORDER BY id ASC")
    .all<{ id: number; created_at: number; embed_id: string; title: string }>();
  return result.results.map((row) => ({
    id: String(row.id),
    createdAt: row.created_at,
    embedId: row.embed_id,
    title: row.title,
  }));
}

export async function getTweets(db: D1Database): Promise<TweetItem[]> {
  const result = await db
    .prepare('SELECT id, created_at, tweet_id, "order" FROM tweets ORDER BY id ASC')
    .all<{ id: number; created_at: number; tweet_id: string; order: number | null }>();
  return result.results
    .map((row) => {
      const item: TweetItem = {
        id: String(row.id),
        createdAt: row.created_at,
        tweetId: row.tweet_id,
      };
      if (row.order !== null) item.order = row.order;
      return item;
    })
    .sort((a, b) => {
      const aHas = a.order !== undefined;
      const bHas = b.order !== undefined;
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return b.createdAt - a.createdAt;
    });
}
