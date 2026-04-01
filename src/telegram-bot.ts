import { Bot, InputFile } from "grammy";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, extname } from "path";
import type { Config } from "./config";
import type { SessionStore } from "./sessions";
import type { MessageQueue } from "./queue";
import { runBtwClaude } from "./claude";
import { log } from "./logger";
import { stripShortcodes } from "./shortcodes";
import type { ApiContext } from "./api";
import type { SettingsStore } from "./settings";
import type { FollowupStore } from "./followup";
import { processMessage } from "./process";
import type { PlatformContext } from "./platform";

const TELEGRAM_MAX_LENGTH = 4096;

const VOICE_EXTENSIONS = new Set([".ogg", ".oga", ".mp3", ".wav", ".m4a", ".flac"]);

/** Download a file from Telegram servers to local disk */
async function downloadTelegramFile(
  bot: Bot,
  fileId: string,
  destDir: string,
  filename: string,
): Promise<string> {
  mkdirSync(destDir, { recursive: true });
  const file = await bot.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const fp = join(destDir, filename);
  writeFileSync(fp, buf);
  return fp;
}

/** Transcribe audio file using faster-whisper via transcribe.py */
async function transcribeAudio(filePath: string, workingDir: string): Promise<string> {
  const scriptPath = join(workingDir, "transcribe.py");
  if (!existsSync(scriptPath)) {
    throw new Error("transcribe.py not found");
  }
  // Use Windows-style path for the Python script
  const winPath = filePath.replace(/\//g, "\\");
  const proc = Bun.spawn(["python", scriptPath, winPath], {
    cwd: workingDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Transcription failed (exit ${exitCode}): ${stderr.slice(0, 200)}`);
  }
  return stdout.trim();
}

export interface TelegramBotDeps {
  config: Config;
  store: SessionStore;
  queue: MessageQueue;
  settings: SettingsStore;
  followupStore: FollowupStore;
  apiContext: ApiContext;
  apiPort: number;
}

export function createTelegramBot(deps: TelegramBotDeps) {
  const { config, store, queue, settings, followupStore, apiContext, apiPort } = deps;

  const bot = new Bot(config.telegramToken!);
  const forumChatId = config.telegramForumChatId;

  // Listen to all messages in forum topics (text, photo, document, voice, audio, video)
  bot.on("message", async (ctx) => {
    // Must be in a forum topic (message_thread_id present)
    const topicId = ctx.message.message_thread_id;
    if (!topicId) return;

    // If forumChatId is set, only respond in that specific chat
    if (forumChatId && String(ctx.chat.id) !== forumChatId) return;

    const chatId = ctx.chat.id;
    const threadId = `tg_${chatId}_${topicId}`;
    const threadName = ctx.message.reply_to_message?.forum_topic_created?.name ?? `topic-${topicId}`;

    const platform = telegramPlatform(bot, chatId, topicId, threadId, threadName);
    apiContext.platforms.set(threadId, platform);
    // Telegram has no message reactions via bot API — no-op for lastMessageReact

    // Extract text from message or caption
    const content = ctx.message.text ?? ctx.message.caption ?? "";

    // Commands (only from text messages, not captions)
    if (ctx.message.text) {
      if (content.trim() === "/stop") {
        const abortedSession = queue.abort(threadId);
        const abortedRalph = apiContext.ralphManager.stop(threadId);
        const aborted = abortedSession || abortedRalph;
        log.warn(`[#${threadName}] ${aborted ? "Stopped" : "Nothing to stop"}${abortedRalph ? " (ralph)" : ""}`);
        await ctx.reply(aborted ? "Stopped." : "Nothing running to stop.", { message_thread_id: topicId });
        return;
      }

      if (content.trim() === "/new") {
        queue.abort(threadId);
        store.clearSession(threadId);
        log.info(`[#${threadName}] Session reset`);
        await ctx.reply("Session reset. Next message starts fresh.", { message_thread_id: topicId });
        return;
      }

      if (content.trim() === "/timezone" || content.startsWith("/timezone ")) {
        const tz = content.slice(10).trim();
        if (!tz) {
          const current = settings.get("user_timezone", "UTC");
          await ctx.reply(`Current timezone: ${current}`, { message_thread_id: topicId });
          return;
        }
        try {
          new Intl.DateTimeFormat("en", { timeZone: tz }).format(new Date());
        } catch {
          await ctx.reply(`Invalid timezone: ${tz}. Use IANA format like Asia/Tokyo, Europe/Belgrade, etc.`, { message_thread_id: topicId });
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
        log.info(`[#${threadName}] Timezone set to ${tz}`);
        await ctx.reply(`Timezone set to ${tz} (current time: ${now})`, { message_thread_id: topicId });
        return;
      }

      // /btw — side question
      if (content.startsWith("/btw ")) {
        const btwPrompt = content.slice(5).trim();
        if (!btwPrompt) return;

        const activeSessionId = store.getSessionId(threadId);
        if (!activeSessionId) {
          await ctx.reply("No active session to peek into.", { message_thread_id: topicId });
          return;
        }

        log.info(`[#${threadName}] BTW: ${btwPrompt.slice(0, 80)}`);

        const btwController = new AbortController();
        await bot.api.sendChatAction(chatId, "typing", { message_thread_id: topicId }).catch(() => {});
        const btwTyping = setInterval(() => {
          bot.api.sendChatAction(chatId, "typing", { message_thread_id: topicId }).catch(() => {});
        }, 8000);

        try {
          await runBtwClaude({
            prompt: btwPrompt,
            activeSessionId,
            claudePath: config.claudePath,
            workingDir: config.workingDir,
            apiPort,
            threadId,
            threadName,
            platform: "telegram",
            signal: btwController.signal,
          });
        } catch (err: any) {
          log.error(`[#${threadName}] BTW error: ${err.message?.slice(0, 200)}`);
          await ctx.reply(`BTW error: ${err.message?.slice(0, 500)}`, { message_thread_id: topicId }).catch(() => {});
        } finally {
          clearInterval(btwTyping);
        }
        return;
      }
    }

    // Process attachments
    const attachDir = join(config.workingDir, ".claw-attachments", threadId);
    const attachmentPaths: string[] = [];
    const transcriptions: string[] = [];

    // Voice notes — transcribe with faster-whisper
    if (ctx.message.voice) {
      const voice = ctx.message.voice;
      const ext = ".ogg";
      const filename = `voice_${Date.now()}${ext}`;
      try {
        const fp = await downloadTelegramFile(bot, voice.file_id, attachDir, filename);
        log.info(`[#${threadName}] Voice: ${filename} (${((voice.file_size ?? 0) / 1024).toFixed(1)}KB)`);
        try {
          const transcription = await transcribeAudio(fp, config.workingDir);
          log.info(`[#${threadName}] Transcribed: ${transcription.slice(0, 80)}`);
          transcriptions.push(transcription);
        } catch (err: any) {
          log.error(`[#${threadName}] Transcription failed: ${err.message}`);
          attachmentPaths.push(fp);
        }
      } catch (err: any) {
        log.error(`[#${threadName}] Voice download failed: ${err.message}`);
      }
    }

    // Audio messages (music files, etc.) — transcribe if voice-like extension
    if (ctx.message.audio) {
      const audio = ctx.message.audio;
      const ext = extname(audio.file_name ?? ".mp3") || ".mp3";
      const filename = `audio_${Date.now()}${ext}`;
      try {
        const fp = await downloadTelegramFile(bot, audio.file_id, attachDir, filename);
        log.info(`[#${threadName}] Audio: ${filename} (${((audio.file_size ?? 0) / 1024).toFixed(1)}KB)`);
        if (VOICE_EXTENSIONS.has(ext.toLowerCase())) {
          try {
            const transcription = await transcribeAudio(fp, config.workingDir);
            log.info(`[#${threadName}] Transcribed: ${transcription.slice(0, 80)}`);
            transcriptions.push(transcription);
          } catch (err: any) {
            log.error(`[#${threadName}] Transcription failed: ${err.message}`);
            attachmentPaths.push(fp);
          }
        } else {
          attachmentPaths.push(fp);
        }
      } catch (err: any) {
        log.error(`[#${threadName}] Audio download failed: ${err.message}`);
      }
    }

    // Photos — use largest size (last element)
    if (ctx.message.photo && ctx.message.photo.length > 0) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const filename = `photo_${Date.now()}.jpg`;
      try {
        const fp = await downloadTelegramFile(bot, photo.file_id, attachDir, filename);
        log.info(`[#${threadName}] Photo: ${filename} (${((photo.file_size ?? 0) / 1024).toFixed(1)}KB)`);
        attachmentPaths.push(fp);
      } catch (err: any) {
        log.error(`[#${threadName}] Photo download failed: ${err.message}`);
      }
    }

    // Documents (files)
    if (ctx.message.document) {
      const doc = ctx.message.document;
      const filename = doc.file_name ?? `file_${Date.now()}`;
      try {
        const fp = await downloadTelegramFile(bot, doc.file_id, attachDir, filename);
        log.info(`[#${threadName}] Document: ${filename} (${((doc.file_size ?? 0) / 1024).toFixed(1)}KB)`);
        // If it's a voice-like file, try to transcribe
        const ext = extname(filename).toLowerCase();
        if (VOICE_EXTENSIONS.has(ext)) {
          try {
            const transcription = await transcribeAudio(fp, config.workingDir);
            log.info(`[#${threadName}] Transcribed: ${transcription.slice(0, 80)}`);
            transcriptions.push(transcription);
          } catch (err: any) {
            log.error(`[#${threadName}] Transcription failed: ${err.message}`);
            attachmentPaths.push(fp);
          }
        } else {
          attachmentPaths.push(fp);
        }
      } catch (err: any) {
        log.error(`[#${threadName}] Document download failed: ${err.message}`);
      }
    }

    // Video
    if (ctx.message.video) {
      const video = ctx.message.video;
      const ext = extname(video.file_name ?? ".mp4") || ".mp4";
      const filename = `video_${Date.now()}${ext}`;
      try {
        const fp = await downloadTelegramFile(bot, video.file_id, attachDir, filename);
        log.info(`[#${threadName}] Video: ${filename} (${((video.file_size ?? 0) / 1024).toFixed(1)}KB)`);
        attachmentPaths.push(fp);
      } catch (err: any) {
        log.error(`[#${threadName}] Video download failed: ${err.message}`);
      }
    }

    // Video note (round video messages)
    if (ctx.message.video_note) {
      const vn = ctx.message.video_note;
      const filename = `videonote_${Date.now()}.mp4`;
      try {
        const fp = await downloadTelegramFile(bot, vn.file_id, attachDir, filename);
        log.info(`[#${threadName}] VideoNote: ${filename} (${((vn.file_size ?? 0) / 1024).toFixed(1)}KB)`);
        attachmentPaths.push(fp);
      } catch (err: any) {
        log.error(`[#${threadName}] VideoNote download failed: ${err.message}`);
      }
    }

    // Build prompt
    let prompt = content;

    if (transcriptions.length > 0) {
      const transcriptionBlock = transcriptions.map(t => `[Voice note transcription]: ${t}`).join("\n");
      prompt = prompt ? `${prompt}\n\n${transcriptionBlock}` : transcriptionBlock;
    }

    if (attachmentPaths.length > 0) {
      const fileBlock = `[User attached files:\n${attachmentPaths.map(p => `- ${p}`).join("\n")}\n]`;
      prompt = prompt ? `${prompt}\n\n${fileBlock}` : fileBlock;
    }

    if (!prompt.trim()) return;

    log.info(`[#${threadName}] ${ctx.from?.first_name ?? "User"}: ${content.slice(0, 80)}${content.length > 80 ? "..." : ""}`);

    // Reset followup timer
    followupStore.schedule(threadId, "telegram");

    if (queue.isActive(threadId)) {
      queue.enqueue(threadId, prompt);
      log.info(`[#${threadName}] Queued`);
      return;
    }

    await processMessage(platform, prompt, config, store, queue, apiPort, settings, followupStore, apiContext);
  });

  return { bot, stop: () => bot.stop() };
}

function telegramPlatform(
  bot: Bot,
  chatId: number,
  topicId: number,
  threadId: string,
  threadName: string,
): PlatformContext {
  return {
    platform: "telegram",
    threadId,
    threadName,
    sendTyping: () =>
      bot.api.sendChatAction(chatId, "typing", { message_thread_id: topicId }).then(() => {}),
    sendMessage: async (text: string) => {
      const clean = stripShortcodes(text);
      if (!clean) return;
      // Telegram max message length is 4096
      if (clean.length <= TELEGRAM_MAX_LENGTH) {
        await bot.api.sendMessage(chatId, clean, { message_thread_id: topicId });
      } else {
        // Chunk manually
        let remaining = clean;
        while (remaining.length > 0) {
          const chunk = remaining.slice(0, TELEGRAM_MAX_LENGTH);
          remaining = remaining.slice(TELEGRAM_MAX_LENGTH);
          await bot.api.sendMessage(chatId, chunk, { message_thread_id: topicId });
        }
      }
    },
    sendFile: async (filePath: string, message?: string) => {
      await bot.api.sendDocument(chatId, new InputFile(filePath), {
        message_thread_id: topicId,
        caption: message || undefined,
      });
    },
  };
}
