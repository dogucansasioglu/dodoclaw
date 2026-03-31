import { Database } from "bun:sqlite";
import { log } from "./logger";

export interface PendingFollowup {
  thread_id: string;
  followup_at: number;
}

export class FollowupStore {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS followups (
        thread_id TEXT PRIMARY KEY,
        followup_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);
  }

  /**
   * Schedule (or reset) a followup for a thread.
   * Random delay between 30-60 minutes from now.
   */
  schedule(threadId: string): void {
    const delayMinutes = 30 + Math.floor(Math.random() * 31); // 30-60
    const followupAt = Math.floor(Date.now() / 1000) + delayMinutes * 60;
    this.db.run(
      `INSERT INTO followups (thread_id, followup_at) VALUES (?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET followup_at = ?, created_at = unixepoch()`,
      [threadId, followupAt, followupAt]
    );
    log.debug(`Followup scheduled for thread ${threadId} in ${delayMinutes}m`);
  }

  /**
   * Cancel followup for a thread (e.g. on /new or /stop).
   */
  cancel(threadId: string): void {
    this.db.run("DELETE FROM followups WHERE thread_id = ?", [threadId]);
  }

  /**
   * Get all followups that are due (followup_at <= now).
   */
  getDue(): PendingFollowup[] {
    const now = Math.floor(Date.now() / 1000);
    return this.db
      .query<PendingFollowup, [number]>(
        "SELECT thread_id, followup_at FROM followups WHERE followup_at <= ?"
      )
      .all(now);
  }

  /**
   * Delete a followup after it fires.
   */
  delete(threadId: string): void {
    this.db.run("DELETE FROM followups WHERE thread_id = ?", [threadId]);
  }
}
