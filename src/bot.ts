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
import type { MessageQueue } from "./queue";
import { runBtwClaude } from "./claude";
import { log } from "./logger";
import { resolveEmoji, resolveReaction } from "./shortcodes";
import type { ApiContext } from "./api";
import type { SettingsStore } from "./settings";
import type { FollowupStore } from "./followup";
import { processMessage } from "./process";
import type { PlatformContext } from "./platform";

export interface BotDeps {
  config: Config;
  store: SessionStore;
  queue: MessageQueue;
  settings: SettingsStore;
  followupStore: FollowupStore;
  apiContext: ApiContext;
  apiPort: number;
}

export function createBot(deps: BotDeps): Client {
  const { config, store, queue, settings, followupStore, apiContext, apiPort } = deps;

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

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

    apiContext.platforms.set(threadId, discordPlatform(thread));
    apiContext.lastMessageReact.set(threadId, (emoji: string) => message.react(emoji).then(() => {}));

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
          apiPort,
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
    followupStore.schedule(threadId, "discord");

    if (queue.isActive(threadId)) {
      queue.enqueue(threadId, prompt);
      log.info(`[#${thread.name}] Queued`);
      await message.react(resolveReaction("Waiting", "⏳"));
      return;
    }

    await processMessage(discordPlatform(thread), prompt, config, store, queue, apiPort, settings, followupStore, apiContext);
  });

  return client;
}

export function discordPlatform(thread: ThreadChannel): PlatformContext {
  return {
    platform: "discord",
    threadId: thread.id,
    threadName: thread.name ?? "unknown",
    sendTyping: () => thread.sendTyping().then(() => {}),
    sendMessage: (text) => thread.send(text).then(() => {}),
    sendFile: (filePath, message) =>
      thread.send({ content: message || undefined, files: [filePath] }).then(() => {}),
    sendSticker: (stickerId) =>
      thread.send({ stickers: [stickerId] }).then(() => {}),
  };
}

function stripMention(message: Message, botId?: string): string {
  if (!botId) return message.content;
  return message.content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
}
