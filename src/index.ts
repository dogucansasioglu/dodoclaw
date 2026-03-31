import { Database } from "bun:sqlite";
import { loadConfig } from "./config";
import { SessionStore } from "./sessions";
import { createBot } from "./bot";
import { log } from "./logger";

log.info("Starting Claude Claw...");

const config = loadConfig();
log.info(`Claude path: ${config.claudePath}`);
log.info(`Working dir: ${config.workingDir}`);
log.info(`Database: ${config.dbPath}`);

const db = new Database(config.dbPath);
const store = new SessionStore(db);
log.ok("Database ready");

const client = createBot(config, store, db);

client.login(config.discordToken).catch((err) => {
  log.error(`Login failed: ${err.message}`);
  process.exit(1);
});

process.on("SIGINT", () => {
  log.info("Shutting down...");
  client.destroy();
  db.close();
  log.ok("Goodbye!");
  process.exit(0);
});
