import { Database } from "bun:sqlite";
import { loadConfig } from "./config";
import { SessionStore } from "./sessions";
import { MessageQueue } from "./queue";
import { CronStore } from "./cron";
import { SettingsStore } from "./settings";
import { FollowupStore } from "./followup";
import { RalphManager } from "./ralph";
import { startApi, type ApiContext } from "./api";
import { createBot } from "./bot";
import { createTelegramBot } from "./telegram-bot";
import { startScheduler } from "./scheduler";
import { log } from "./logger";

log.info("Starting dodoclaw...");

const config = loadConfig();
log.info(`Claude path: ${config.claudePath}`);
log.info(`Working dir: ${config.workingDir}`);
log.info(`Database: ${config.dbPath}`);

const db = new Database(config.dbPath);
const store = new SessionStore(db);
log.ok("Database ready");

// Shared infrastructure — single instance for all platforms
const queue = new MessageQueue();
const cronStore = new CronStore(db);
const settings = new SettingsStore(db);
const followupStore = new FollowupStore(db);

const apiContext: ApiContext = {
  platforms: new Map(),
  lastMessageReact: new Map(),
  cronStore,
  ralphManager: new RalphManager(),
  repliedThreads: new Set(),
};

const api = startApi(apiContext);

const sharedDeps = { config, store, queue, settings, followupStore, apiContext, cronStore, apiPort: api.port };

let discordClient: ReturnType<typeof createBot> | undefined;
let telegramBot: ReturnType<typeof createTelegramBot> | undefined;

if (config.discordToken) {
  discordClient = createBot(sharedDeps);
  discordClient.login(config.discordToken).catch((err) => {
    log.error(`Discord login failed: ${err.message}`);
    process.exit(1);
  });
} else {
  log.info("No DISCORD_TOKEN — skipping Discord bot");
}

if (config.telegramToken) {
  telegramBot = createTelegramBot(sharedDeps);
  telegramBot.bot.start({
    onStart: () => log.ok("Telegram bot online"),
  });
} else {
  log.info("No TELEGRAM_TOKEN — skipping Telegram bot");
}

// Single scheduler for cron + followups across all platforms
const scheduler = startScheduler(sharedDeps);

process.on("SIGINT", () => {
  log.info("Shutting down...");
  scheduler.stop();
  discordClient?.destroy();
  telegramBot?.stop();
  api.stop();
  db.close();
  log.ok("Goodbye!");
  process.exit(0);
});
