import { Database } from "bun:sqlite";
import { randomBytes } from "crypto";
import { log } from "./logger";

export interface CronTask {
  id: string;
  thread_id: string;
  platform: string;
  schedule: string;
  prompt: string;
  description: string;
  created_at: number;
  last_run_at: number | null;
}

export class CronStore {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cron_tasks (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'discord',
        schedule TEXT NOT NULL,
        prompt TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at INTEGER DEFAULT (unixepoch()),
        last_run_at INTEGER
      )
    `);
    // Migration: add platform column to existing tables
    try {
      this.db.run(`ALTER TABLE cron_tasks ADD COLUMN platform TEXT NOT NULL DEFAULT 'discord'`);
    } catch {
      // Column already exists
    }
  }

  create(threadId: string, schedule: string, prompt: string, description: string, platform: string = "discord"): string {
    const id = randomBytes(4).toString("hex");
    this.db.run(
      "INSERT INTO cron_tasks (id, thread_id, platform, schedule, prompt, description) VALUES (?, ?, ?, ?, ?, ?)",
      [id, threadId, platform, schedule, prompt, description]
    );
    return id;
  }

  delete(id: string, threadId: string): boolean {
    const result = this.db.run(
      "DELETE FROM cron_tasks WHERE id = ? AND thread_id = ?",
      [id, threadId]
    );
    return result.changes > 0;
  }

  listByThread(threadId: string): CronTask[] {
    return this.db
      .query<CronTask, [string]>(
        "SELECT * FROM cron_tasks WHERE thread_id = ? ORDER BY created_at"
      )
      .all(threadId);
  }

  listAll(): CronTask[] {
    return this.db
      .query<CronTask, []>("SELECT * FROM cron_tasks ORDER BY created_at")
      .all();
  }

  updateLastRun(id: string): void {
    this.db.run(
      "UPDATE cron_tasks SET last_run_at = unixepoch() WHERE id = ?",
      [id]
    );
  }
}

// Simple cron expression parser (5-field: min hour dom month dow)
export function shouldRun(schedule: string, now: Date, lastRunAt: number | null): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minExpr, hourExpr, domExpr, monExpr, dowExpr] = parts;
  const minute = now.getMinutes();
  const hour = now.getHours();
  const dom = now.getDate();
  const month = now.getMonth() + 1;
  const dow = now.getDay(); // 0 = Sunday

  if (!matchField(minExpr, minute, 0, 59)) return false;
  if (!matchField(hourExpr, hour, 0, 23)) return false;
  if (!matchField(domExpr, dom, 1, 31)) return false;
  if (!matchField(monExpr, month, 1, 12)) return false;
  if (!matchField(dowExpr, dow, 0, 6)) return false;

  // Don't run if already ran this minute
  if (lastRunAt) {
    const lastRun = new Date(lastRunAt * 1000);
    if (
      lastRun.getMinutes() === minute &&
      lastRun.getHours() === hour &&
      lastRun.getDate() === dom
    ) {
      return false;
    }
  }

  return true;
}

function matchField(expr: string, value: number, min: number, max: number): boolean {
  if (expr === "*") return true;

  // Handle step: */5, */10 etc.
  if (expr.startsWith("*/")) {
    const step = parseInt(expr.slice(2));
    return !isNaN(step) && value % step === 0;
  }

  // Handle ranges: 1-5
  if (expr.includes("-")) {
    const [start, end] = expr.split("-").map(Number);
    return value >= start && value <= end;
  }

  // Handle lists: 1,3,5
  if (expr.includes(",")) {
    return expr.split(",").map(Number).includes(value);
  }

  // Exact match
  return parseInt(expr) === value;
}
