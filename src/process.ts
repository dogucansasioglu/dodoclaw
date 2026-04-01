import type { Config } from "./config";
import type { SessionStore } from "./sessions";
import { MessageQueue } from "./queue";
import { runClaude } from "./claude";
import { chunkMessage } from "./formatter";
import { log } from "./logger";
import { resolveEmoji } from "./shortcodes";
import type { ApiContext } from "./api";
import { SettingsStore } from "./settings";
import { FollowupStore } from "./followup";
import type { PlatformContext } from "./platform";

export async function processMessage(
  ctx: PlatformContext,
  prompt: string,
  config: Config,
  store: SessionStore,
  queue: MessageQueue,
  apiPort: number,
  settings: SettingsStore,
  followupStore?: FollowupStore,
  apiContext?: ApiContext,
): Promise<void> {
  const { threadId, threadName } = ctx;
  const controller = new AbortController();
  queue.setActive(threadId, controller);

  const typingInterval = setInterval(() => {
    ctx.sendTyping().catch(() => {});
  }, 8000);
  ctx.sendTyping().catch(() => {});

  try {
    const existingSessionId = store.getSessionId(threadId);

    if (existingSessionId) {
      log.claude(`[#${threadName}] Resuming session ${existingSessionId.slice(0, 8)}...`);
    } else {
      log.claude(`[#${threadName}] Starting new session`);
    }

    const startTime = Date.now();

    const result = await runClaude({
      prompt,
      resumeSessionId: existingSessionId ?? undefined,
      claudePath: config.claudePath,
      workingDir: config.workingDir,
      apiPort,
      threadId,
      threadName,
      platform: ctx.platform,
      signal: controller.signal,
      userTimezone: settings.get("user_timezone"),
      messageTimestamp: Date.now(),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (existingSessionId) {
      store.updateLastUsed(threadId);
    } else {
      store.saveSession(threadId, result.sessionId);
      log.ok(`[#${threadName}] Session saved: ${result.sessionId.slice(0, 8)}...`);
    }

    // Send result text as fallback ONLY if Claude didn't use the API
    const maxLen = ctx.platform === "telegram" ? 4096 : 1990;
    const usedApi = apiContext?.repliedThreads.has(threadId);
    if (result.text && !usedApi) {
      const chunks = chunkMessage(result.text, maxLen);
      for (const chunk of chunks) {
        await ctx.sendMessage(chunk);
      }
      log.ok(`[#${threadName}] Fallback reply (${elapsed}s, ${result.text.length} chars)`);
    } else {
      log.ok(`[#${threadName}] Done (${elapsed}s)`);
    }
    // Clear the replied flag for next invocation
    apiContext?.repliedThreads.delete(threadId);
  } catch (err: any) {
    if (controller.signal.aborted) {
      log.warn(`[#${threadName}] Aborted`);
      return;
    }
    const errorMsg = err?.message ?? "Unknown error";
    log.error(`[#${threadName}] ${errorMsg.slice(0, 200)}`);
    const isIdleTimeout = errorMsg.includes("no output for 2 minutes");
    const maxErrorLen = ctx.platform === "telegram" ? 4000 : 1900;
    const errorReply = isIdleTimeout
      ? `Looks like I got stuck — no output for 2 minutes, killed the process. Try again ${resolveEmoji("Laplus_Dumb", "😵")}`
      : `Error: ${errorMsg.slice(0, maxErrorLen)}`;
    await ctx.sendMessage(errorReply).catch(() => {});
  } finally {
    clearInterval(typingInterval);
    queue.clearActive(threadId);

    const queued = queue.drain(threadId);
    if (queued) {
      log.info(`[#${threadName}] Processing queued messages`);
      await processMessage(ctx, queued, config, store, queue, apiPort, settings, followupStore, apiContext);
    }
  }
}
