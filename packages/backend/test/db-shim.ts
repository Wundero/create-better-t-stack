/**
 * Minimal D1 shim backed by Bun's built-in SQLite (`bun:sqlite`).
 *
 * Purpose: exercise the Worker routes in `bun test` with real SQLite semantics
 * (constraints, `ON CONFLICT`, `AUTOINCREMENT`, `changes`) without pulling in
 * workerd. It implements only the subset of the D1 API the backend uses:
 * `prepare().bind().first()/all()/run()`, `batch()` and `exec()`.
 */
import { Database } from "bun:sqlite";

type SqlParam = string | number | boolean | null | undefined;

function normalize(param: SqlParam): string | number | null {
  if (param === undefined || param === null) return null;
  if (typeof param === "boolean") return param ? 1 : 0;
  return param;
}

function normalizeAll(params: readonly SqlParam[]): (string | number | null)[] {
  return params.map(normalize);
}

export type ShimbResultMeta = {
  changes: number;
  last_row_id: number;
  duration: number;
};

export type ShimResult<T = Record<string, unknown>> = {
  results: T[];
  success: true;
  meta: ShimbResultMeta;
};

class ShimStatement {
  private params: (string | number | null)[] = [];

  constructor(
    private readonly db: Database,
    private readonly sql: string,
    private readonly hook?: (sql: string) => ShimResult | null,
  ) {}

  bind(...values: SqlParam[]): this {
    this.params = normalizeAll(values);
    return this;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.db.query(this.sql).get(...this.params);
    return (row as T | null) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<ShimResult<T>> {
    const rows = this.db.query(this.sql).all(...this.params) as T[];
    return { results: rows, success: true, meta: { changes: 0, last_row_id: 0, duration: 0 } };
  }

  async run(): Promise<ShimResult> {
    const intercepted = this.hook?.(this.sql);
    if (intercepted) return intercepted;
    const info = this.db.query(this.sql).run(...this.params);
    return {
      results: [],
      success: true,
      meta: {
        changes: Number(info.changes ?? 0),
        last_row_id: Number(info.lastInsertRowid ?? 0),
        duration: 0,
      },
    };
  }

  raw<T = unknown>(): Promise<T[]> {
    const rows = this.db.query(this.sql).values(...this.params) as T[];
    return Promise.resolve(rows);
  }
}

export class D1Shim {
  private readonly db: Database;
  private readonly hook?: (sql: string) => ShimResult | null;

  constructor(hooks: { beforeRun?: (sql: string) => ShimResult | null } = {}) {
    this.db = new Database(":memory:");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.hook = hooks.beforeRun;
  }

  prepare(sql: string): ShimStatement {
    return new ShimStatement(this.db, sql, this.hook);
  }

  async batch(statements: ShimStatement[]): Promise<ShimResult[]> {
    const results: ShimResult[] = [];
    this.db.exec("BEGIN");
    try {
      for (const statement of statements) {
        results.push(await statement.run());
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return results;
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    this.db.exec(sql);
    return { count: 1, duration: 0 };
  }
}
