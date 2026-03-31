import type { ThreadChannel, Message } from "discord.js";
import { chunkMessage } from "./formatter";
import { parseShortcodes, resolveEmoji } from "./shortcodes";
import { log } from "./logger";
import type { CronStore } from "./cron";
import { RalphManager, formatIterationUpdate, formatRalphSummary, createRalphBranch, createRalphPR } from "./ralph";

export interface ApiContext {
  threads: Map<string, ThreadChannel>;
  lastMessages: Map<string, Message>;
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
      const thread = context.threads.get(threadId);

      if (!thread) {
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
          const { text, stickers, gifs } = parseShortcodes(raw);

          // Send text message (if any remains after extraction)
          if (text) {
            const chunks = chunkMessage(text);
            for (const chunk of chunks) {
              await thread.send(chunk);
            }
          }

          // Send stickers as separate messages
          for (const stickerId of stickers) {
            await thread.send({ stickers: [stickerId] });
          }

          // Send GIFs as separate messages
          for (const gifUrl of gifs) {
            await thread.send(gifUrl);
          }

          context.repliedThreads.add(threadId);
          log.info(`[#${thread.name}] Claude sent: ${raw.slice(0, 80)}${raw.length > 80 ? "..." : ""}`);
          return json({ ok: true });
        }

        if (req.method === "POST" && action === "send-file") {
          await thread.send({
            content: body.message || undefined,
            files: [body.file_path],
          });
          log.info(`[#${thread.name}] Claude sent file: ${body.file_path}`);
          return json({ ok: true });
        }

        if (req.method === "POST" && action === "react") {
          const lastMsg = context.lastMessages.get(threadId);
          if (lastMsg) {
            await lastMsg.react(body.emoji);
            log.info(`[#${thread.name}] Claude reacted: ${body.emoji}`);
            return json({ ok: true });
          }
          return json({ error: "No message to react to" }, 404);
        }

        if (req.method === "POST" && action === "cron") {
          const id = context.cronStore.create(threadId, body.schedule, body.prompt, body.description ?? "");
          log.info(`[#${thread.name}] Cron created: ${id} — ${body.schedule}`);
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

            log.info(`[#${thread.name}] Ralph starting: ${iterations} iterations`);

            // Create branch before starting loop
            let branchName: string | undefined;
            try {
              branchName = await createRalphBranch(workingDir);
              await thread.send(`Ralph started on branch \`${branchName}\` — ${iterations} iterations ${resolveEmoji("Bongo_Code", "⌨️")}`);
            } catch (err: any) {
              log.warn(`[#${thread.name}] Ralph branch creation failed: ${err.message}`);
              await thread.send(`Ralph starting (branch creation failed: ${err.message})`);
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
                await thread.send(msg).catch(() => {});
              },
              onDone: async (summary) => {
                let prUrl: string | undefined;
                if (branchName && summary.successCount > 0) {
                  try {
                    prUrl = await createRalphPR(workingDir, branchName, summary);
                  } catch (err: any) {
                    log.warn(`[#${thread.name}] Ralph PR creation failed: ${err.message}`);
                  }
                }
                const msg = formatRalphSummary(summary, prUrl);
                await thread.send(msg).catch(() => {});
              },
            });

            return json({ ok: true, branch: branchName });
          }

          if (req.method === "POST" && subAction === "stop") {
            const stopped = context.ralphManager.stop(threadId);
            if (stopped) {
              log.warn(`[#${thread.name}] Ralph stopped by user`);
            }
            return json({ ok: stopped });
          }

          if (req.method === "GET" && subAction === "status") {
            return json({ running: context.ralphManager.isRunning(threadId) });
          }
        }

        return json({ error: `Unknown action: ${action}` }, 400);
      } catch (err: any) {
        log.error(`[#${thread.name}] API error: ${err.message}`);
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
