import { chunkMessage } from "./formatter";
import { parseShortcodes, stripShortcodes, resolveEmoji } from "./shortcodes";
import { log } from "./logger";
import type { CronStore } from "./cron";
import { RalphManager, formatIterationUpdate, formatRalphSummary, createRalphBranch, createRalphPR } from "./ralph";
import type { PlatformContext } from "./platform";

export interface ApiContext {
  platforms: Map<string, PlatformContext>;
  lastMessageReact: Map<string, (emoji: string) => Promise<void>>;
  cronStore: CronStore;
  ralphManager: RalphManager;
  /** Track threads that received at least one reply via API */
  repliedThreads: Set<string>;
}

export function startApi(context: ApiContext): { port: number; stop: () => void } {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const parts = url.pathname.split("/").filter(Boolean);

      // All routes: /thread/:threadId/:action
      if (parts[0] !== "thread" || parts.length < 3) {
        return json({ error: "Use /thread/:threadId/:action" }, 400);
      }

      const threadId = parts[1];
      const action = parts[2];
      const platform = context.platforms.get(threadId);

      if (!platform) {
        return json({ error: "Thread not found" }, 404);
      }

      try {
        let body: any = {};
        if (req.method === "POST" || req.method === "DELETE") {
          try {
            body = await req.json();
          } catch {
            return json({ error: "Invalid JSON body" }, 400);
          }
        }

        if (req.method === "POST" && action === "reply") {
          const raw = body.text ?? "";

          if (platform.platform === "discord") {
            // Discord: parse shortcodes for stickers, GIFs, emojis
            const { text, stickers, gifs } = parseShortcodes(raw);

            if (text) {
              const chunks = chunkMessage(text);
              for (const chunk of chunks) {
                await platform.sendMessage(chunk);
              }
            }

            // Send stickers as separate messages (Discord-only)
            for (const stickerId of stickers) {
              await platform.sendSticker!(stickerId);
            }

            // Send GIFs as separate messages (Discord-only)
            for (const gifUrl of gifs) {
              await platform.sendMessage(gifUrl);
            }
          } else {
            // Telegram: strip shortcodes, send plain text
            const text = stripShortcodes(raw);
            if (text) {
              const chunks = chunkMessage(text, 4096);
              for (const chunk of chunks) {
                await platform.sendMessage(chunk);
              }
            }
          }

          context.repliedThreads.add(threadId);
          log.info(`[#${platform.threadName}] Claude sent: ${raw.slice(0, 80)}${raw.length > 80 ? "..." : ""}`);
          return json({ ok: true });
        }

        if (req.method === "POST" && action === "send-file") {
          await platform.sendFile(body.file_path, body.message || undefined);
          log.info(`[#${platform.threadName}] Claude sent file: ${body.file_path}`);
          return json({ ok: true });
        }

        if (req.method === "POST" && action === "react") {
          const reactFn = context.lastMessageReact.get(threadId);
          if (reactFn) {
            await reactFn(body.emoji);
            log.info(`[#${platform.threadName}] Claude reacted: ${body.emoji}`);
            return json({ ok: true });
          }
          return json({ error: "No message to react to" }, 404);
        }

        if (req.method === "POST" && action === "cron") {
          const id = context.cronStore.create(threadId, body.schedule, body.prompt, body.description ?? "", platform.platform);
          log.info(`[#${platform.threadName}] Cron created: ${id} — ${body.schedule} (${platform.platform})`);
          return json({ ok: true, id });
        }

        if (req.method === "GET" && action === "cron") {
          const tasks = context.cronStore.listByThread(threadId);
          return json({ tasks });
        }

        if (req.method === "DELETE" && action === "cron") {
          const deleted = context.cronStore.delete(body.id, threadId);
          return json({ ok: deleted });
        }

        // Ralph endpoints: /thread/:threadId/ralph/start and /thread/:threadId/ralph/stop
        if (action === "ralph") {
          const subAction = parts[3];

          if (req.method === "POST" && subAction === "start") {
            if (context.ralphManager.isRunning(threadId)) {
              return json({ error: "Ralph already running on this thread" }, 409);
            }

            const { workingDir, iterations, prompt, claudePath } = body;
            if (!workingDir || !iterations || !prompt) {
              return json({ error: "Missing required fields: workingDir, iterations, prompt" }, 400);
            }

            log.info(`[#${platform.threadName}] Ralph starting: ${iterations} iterations`);

            // Create branch before starting loop
            let branchName: string | undefined;
            try {
              branchName = await createRalphBranch(workingDir);
              await platform.sendMessage(`Ralph started on branch \`${branchName}\` — ${iterations} iterations ${resolveEmoji("Bongo_Code", "⌨️")}`);
            } catch (err: any) {
              log.warn(`[#${platform.threadName}] Ralph branch creation failed: ${err.message}`);
              await platform.sendMessage(`Ralph starting (branch creation failed: ${err.message})`);
            }

            // Start loop in background (don't await)
            context.ralphManager.start({
              threadId,
              claudePath: claudePath ?? "claude",
              workingDir,
              iterations,
              prompt,
              onIterationComplete: async (update) => {
                const msg = formatIterationUpdate(update);
                await platform.sendMessage(msg).catch(() => {});
              },
              onDone: async (summary) => {
                let prUrl: string | undefined;
                if (branchName && summary.successCount > 0) {
                  try {
                    prUrl = await createRalphPR(workingDir, branchName, summary);
                  } catch (err: any) {
                    log.warn(`[#${platform.threadName}] Ralph PR creation failed: ${err.message}`);
                  }
                }
                const msg = formatRalphSummary(summary, prUrl);
                await platform.sendMessage(msg).catch(() => {});
              },
            });

            return json({ ok: true, branch: branchName });
          }

          if (req.method === "POST" && subAction === "stop") {
            const stopped = context.ralphManager.stop(threadId);
            if (stopped) {
              log.warn(`[#${platform.threadName}] Ralph stopped by user`);
            }
            return json({ ok: stopped });
          }

          if (req.method === "GET" && subAction === "status") {
            return json({ running: context.ralphManager.isRunning(threadId) });
          }
        }

        return json({ error: `Unknown action: ${action}` }, 400);
      } catch (err: any) {
        log.error(`[#${platform.threadName}] API error: ${err.message}`);
        return json({ error: err.message }, 500);
      }
    },
  });

  const port = server.port;
  log.info(`API listening on http://localhost:${port}`);

  return {
    port,
    stop: () => server.stop(),
  };
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
