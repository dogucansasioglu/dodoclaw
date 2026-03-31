import {
  Client,
  Events,
  GatewayIntentBits,
  type Message,
  type ThreadChannel,
} from "discord.js";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { Config } from "./config";
import type { SessionStore } from "./sessions";
import { MessageQueue } from "./queue";
import { runClaude, runBtwClaude } from "./claude";
import { chunkMessage } from "./formatter";
import { log } from "./logger";
import { resolveEmoji, resolveReaction } from "./shortcodes";
import { startApi, type ApiContext } from "./api";
import { CronStore, shouldRun } from "./cron";
import { SettingsStore } from "./settings";
import { FollowupStore } from "./followup";
import { RalphManager } from "./ralph";
import { Database } from "bun:sqlite";

export function createBot(config: Config, store: SessionStore, db: Database): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const queue = new MessageQueue();
  const cronStore = new CronStore(db);
  const settings = new SettingsStore(db);
  const followupStore = new FollowupStore(db);

  const apiContext: ApiContext = {
    threads: new Map(),
    lastMessages: new Map(),
    cronStore,
    ralphManager: new RalphManager(),
    repliedThreads: new Set(),
  };

  const api = startApi(apiContext);

  // Cron scheduler + followup checker — every 60 seconds
  const cronInterval = setInterval(async () => {
    // --- Cron tasks ---
    const now = new Date();
    const tasks = cronStore.listAll();
    for (const task of tasks) {
      if (shouldRun(task.schedule, now, task.last_run_at)) {
        const thread = apiContext.threads.get(task.thread_id);
        if (!thread) continue;

        log.info(`[#${thread.name}] Cron firing: ${task.id} — ${task.description || task.prompt.slice(0, 40)}`);
        cronStore.updateLastRun(task.id);

        if (!queue.isActive(task.thread_id)) {
          processMessage(task.thread_id, task.prompt, thread, config, store, queue, api.port, settings, followupStore, apiContext);
        } else {
          queue.enqueue(task.thread_id, task.prompt);
        }
      }
    }

    // --- Followup checker ---
    const dueFollowups = followupStore.getDue();
    for (const followup of dueFollowups) {
      const thread = apiContext.threads.get(followup.thread_id);
      if (!thread) {
        // No thread reference — can't send, just clean up
        followupStore.delete(followup.thread_id);
        continue;
      }

      log.info(`[#${thread.name}] Followup firing`);
      followupStore.delete(followup.thread_id); // one-shot: delete before firing

      const followupPrompt = `[SYSTEM: The user has been quiet for a while. Send a natural, casual follow-up message as a friend would — ask what they're up to, reference what you were talking about, or just check in. Keep it short and natural. Do NOT mention that this is automated or that you're "checking in because they've been quiet." Just be natural like a friend texting.]`;

      if (!queue.isActive(followup.thread_id)) {
        processMessage(followup.thread_id, followupPrompt, thread, config, store, queue, api.port, settings, followupStore, apiContext);
      } else {
        queue.enqueue(followup.thread_id, followupPrompt);
      }
    }
  }, 60_000);

  client.once(Events.ClientReady, (c) => {
    log.ok(`Online as ${c.user.tag} (${c.user.id})`);
    log.info(`Watching ${c.guilds.cache.size} server(s)`);
  });

  client.on(Events.ShardReady, (id) => log.ok(`Shard ${id} connected`));
  client.on(Events.ShardDisconnect, (event, id) => log.warn(`Shard ${id} disconnected (code ${event.code})`));
  client.on(Events.ShardReconnecting, (id) => log.info(`Shard ${id} reconnecting...`));
  client.on(Events.ShardResume, (id, replayed) => log.ok(`Shard ${id} resumed (${replayed} events replayed)`));
  client.on(Events.ShardError, (error, id) => log.error(`Shard ${id} error: ${error.message}`));
  client.on(Events.Warn, (msg) => log.warn(`Discord.js: ${msg}`));
  client.on(Events.Error, (error) => log.error(`Discord.js: ${error.message}`));

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.channel.isThread()) return;

    const thread = message.channel as ThreadChannel;
    const threadId = thread.id;

    apiContext.threads.set(threadId, thread);
    apiContext.lastMessages.set(threadId, message);

    const content = stripMention(message, client.user?.id);

    if (content.trim() === "/stop" || content.trim() === "!stop") {
      const abortedSession = queue.abort(threadId);
      const abortedRalph = apiContext.ralphManager.stop(threadId);
      const aborted = abortedSession || abortedRalph;
      log.warn(`[#${thread.name}] ${aborted ? "Stopped" : "Nothing to stop"}${abortedRalph ? " (ralph)" : ""}`);
      await thread.send(aborted ? "Stopped." : "Nothing running to stop.");
      return;
    }

    if (content.trim() === "/new" || content.trim() === "!new") {
      queue.abort(threadId);
      store.clearSession(threadId);
      log.info(`[#${thread.name}] Session reset`);
      await thread.send("Session reset. Next message starts fresh.");
      return;
    }

    if (content.trim() === "/restart" || content.trim() === "!restart") {
      log.warn(`[#${thread.name}] Restart requested`);
      await thread.send(`Restarting... ${resolveEmoji("Waiting", "⏳")}`);
      setTimeout(() => process.exit(0), 500);
      return;
    }

    if (content.startsWith("/timezone ") || content.startsWith("!timezone ")) {
      const tz = content.slice(10).trim();
      if (!tz) {
        const current = settings.get("user_timezone", "UTC");
        await thread.send(`Current timezone: **${current}**`);
        return;
      }
      // Validate timezone
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz }).format(new Date());
      } catch {
        await thread.send(`Invalid timezone: \`${tz}\`. Use IANA format like \`Asia/Tokyo\`, \`Europe/Belgrade\`, etc.`);
        return;
      }
      settings.set("user_timezone", tz);
      const now = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZoneName: "short",
      }).format(new Date());
      log.info(`[#${thread.name}] Timezone set to ${tz}`);
      await thread.send(`Timezone set to **${tz}** (current time: ${now})`);
      return;
    }

    if (content.trim() === "/timezone" || content.trim() === "!timezone") {
      const current = settings.get("user_timezone", "UTC");
      await thread.send(`Current timezone: **${current}**`);
      return;
    }

    // /btw — side question that bypasses queue, reads active session's log
    if (content.startsWith("/btw ") || content.startsWith("!btw ")) {
      const btwPrompt = content.slice(5).trim();
      if (!btwPrompt) return;

      const activeSessionId = store.getSessionId(threadId);
      if (!activeSessionId) {
        await thread.send("No active session to peek into.");
        return;
      }

      log.info(`[#${thread.name}] BTW: ${btwPrompt.slice(0, 80)}`);
      await message.react("👀").catch(() => {});

      // Run independently — no queue involvement
      const btwController = new AbortController();
      thread.sendTyping().catch(() => {});
      const btwTyping = setInterval(() => thread.sendTyping().catch(() => {}), 8000);

      try {
        await runBtwClaude({
          prompt: btwPrompt,
          activeSessionId,
          claudePath: config.claudePath,
          workingDir: config.workingDir,
          apiPort: api.port,
          threadId,
          threadName: thread.name ?? undefined,
          signal: btwController.signal,
        });
      } catch (err: any) {
        log.error(`[#${thread.name}] BTW error: ${err.message?.slice(0, 200)}`);
        await thread.send(`BTW error: ${err.message?.slice(0, 500)}`).catch(() => {});
      } finally {
        clearInterval(btwTyping);
      }
      return;
    }

    // Download attachments
    let prompt = content;
    if (message.attachments.size > 0) {
      const dir = join(config.workingDir, ".claw-attachments", threadId);
      mkdirSync(dir, { recursive: true });

      const paths: string[] = [];
      for (const [, att] of message.attachments) {
        try {
          const res = await fetch(att.url);
          const buf = Buffer.from(await res.arrayBuffer());
          const fp = join(dir, att.name ?? "file");
          writeFileSync(fp, buf);
          paths.push(fp);
          log.info(`[#${thread.name}] Attachment: ${att.name} (${(buf.length / 1024).toFixed(1)}KB)`);
        } catch (err: any) {
          log.error(`[#${thread.name}] Download failed: ${err.message}`);
        }
      }

      if (paths.length > 0) {
        prompt = `${content}\n\n[User attached files:\n${paths.map(p => `- ${p}`).join("\n")}\n]`;
      }
    }

    if (!prompt.trim()) return;

    log.info(`[#${thread.name}] ${message.author.displayName}: ${content.slice(0, 80)}${content.length > 80 ? "..." : ""}`);

    // Reset followup timer on every user message
    followupStore.schedule(threadId);

    if (queue.isActive(threadId)) {
      queue.enqueue(threadId, prompt);
      log.info(`[#${thread.name}] Queued`);
      await message.react(resolveReaction("Waiting", "⏳"));
      return;
    }

    await processMessage(threadId, prompt, thread, config, store, queue, api.port, settings, followupStore, apiContext);
  });

  const originalDestroy = client.destroy.bind(client);
  client.destroy = () => {
    clearInterval(cronInterval);
    api.stop();
    return originalDestroy();
  };

  return client;
}

async function processMessage(
  threadId: string,
  prompt: string,
  thread: ThreadChannel,
  config: Config,
  store: SessionStore,
  queue: MessageQueue,
  apiPort: number,
  settings: SettingsStore,
  followupStore?: FollowupStore,
  apiContext?: ApiContext,
): Promise<void> {
  const controller = new AbortController();
  queue.setActive(threadId, controller);

  const typingInterval = setInterval(() => {
    thread.sendTyping().catch(() => {});
  }, 8000);
  thread.sendTyping().catch(() => {});

  try {
    const existingSessionId = store.getSessionId(threadId);

    if (existingSessionId) {
      log.claude(`[#${thread.name}] Resuming session ${existingSessionId.slice(0, 8)}...`);
    } else {
      log.claude(`[#${thread.name}] Starting new session`);
    }

    const startTime = Date.now();

    const result = await runClaude({
      prompt,
      resumeSessionId: existingSessionId ?? undefined,
      claudePath: config.claudePath,
      workingDir: config.workingDir,
      apiPort,
      threadId,
      threadName: thread.name ?? undefined,
      signal: controller.signal,
      userTimezone: settings.get("user_timezone"),
      messageTimestamp: Date.now(),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (existingSessionId) {
      store.updateLastUsed(threadId);
    } else {
      store.saveSession(threadId, result.sessionId);
      log.ok(`[#${thread.name}] Session saved: ${result.sessionId.slice(0, 8)}...`);
    }

    // Send result text as fallback ONLY if Claude didn't use the API
    const usedApi = apiContext?.repliedThreads.has(threadId);
    if (result.text && !usedApi) {
      const chunks = chunkMessage(result.text);
      for (const chunk of chunks) {
        await thread.send(chunk);
      }
      log.ok(`[#${thread.name}] Fallback reply (${elapsed}s, ${result.text.length} chars)`);
    } else {
      log.ok(`[#${thread.name}] Done (${elapsed}s)`);
    }
    // Clear the replied flag for next invocation
    apiContext?.repliedThreads.delete(threadId);
  } catch (err: any) {
    if (controller.signal.aborted) {
      log.warn(`[#${thread.name}] Aborted`);
      return;
    }
    const errorMsg = err?.message ?? "Unknown error";
    log.error(`[#${thread.name}] ${errorMsg.slice(0, 200)}`);
    const isIdleTimeout = errorMsg.includes("no output for 2 minutes");
    const discordMsg = isIdleTimeout
      ? `Looks like I got stuck — no output for 2 minutes, killed the process. Try again ${resolveEmoji("Laplus_Dumb", "😵")}`
      : `Error: ${errorMsg.slice(0, 1900)}`;
    await thread.send(discordMsg).catch(() => {});
  } finally {
    clearInterval(typingInterval);
    queue.clearActive(threadId);

    const queued = queue.drain(threadId);
    if (queued) {
      log.info(`[#${thread.name}] Processing queued messages`);
      await processMessage(threadId, queued, thread, config, store, queue, apiPort, settings, followupStore, apiContext);
    }
  }
}

function stripMention(message: Message, botId?: string): string {
  if (!botId) return message.content;
  return message.content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
}
