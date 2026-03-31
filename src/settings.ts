import { Database } from "bun:sqlite";

export class SettingsStore {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  get(key: string, fallback?: string): string | undefined {
    const row = this.db
      .query<{ value: string }, [string]>(
        "SELECT value FROM settings WHERE key = ?"
      )
      .get(key);
    return row?.value ?? fallback;
  }

  set(key: string, value: string): void {
    this.db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = ?`,
      [key, value, value]
    );
  }
}
