import { Database } from "bun:sqlite";

export class SessionStore {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        thread_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        last_used_at INTEGER DEFAULT (unixepoch())
      )
    `);
  }

  getSessionId(threadId: string): string | null {
    const row = this.db
      .query<{ session_id: string }, [string]>(
        "SELECT session_id FROM sessions WHERE thread_id = ?"
      )
      .get(threadId);
    return row?.session_id ?? null;
  }

  saveSession(threadId: string, sessionId: string): void {
    this.db.run(
      `INSERT INTO sessions (thread_id, session_id) VALUES (?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET session_id = ?, last_used_at = unixepoch()`,
      [threadId, sessionId, sessionId]
    );
  }

  updateLastUsed(threadId: string): void {
    this.db.run(
      "UPDATE sessions SET last_used_at = unixepoch() WHERE thread_id = ?",
      [threadId]
    );
  }

  clearSession(threadId: string): void {
    this.db.run("DELETE FROM sessions WHERE thread_id = ?", [threadId]);
  }
}
