import type { Config } from "./config";
import type { SessionStore } from "./sessions";
import type { MessageQueue } from "./queue";
import type { CronStore } from "./cron";
import { shouldRun } from "./cron";
import type { SettingsStore } from "./settings";
import type { FollowupStore } from "./followup";
import type { ApiContext } from "./api";
import { processMessage } from "./process";
import { log } from "./logger";

const FOLLOWUP_PROMPT = `[SYSTEM: The user has been quiet for a while. Send a natural, casual follow-up message as a friend would — ask what they're up to, reference what you were talking about, or just check in. Keep it short and natural. Do NOT mention that this is automated or that you're "checking in because they've been quiet." Just be natural like a friend texting.]`;

interface SchedulerDeps {
  apiContext: ApiContext;
  cronStore: CronStore;
  followupStore: FollowupStore;
  queue: MessageQueue;
  config: Config;
  store: SessionStore;
  apiPort: number;
  settings: SettingsStore;
}

export function startScheduler(deps: SchedulerDeps): { stop: () => void } {
  const { apiContext, cronStore, followupStore, queue, config, store, apiPort, settings } = deps;

  const interval = setInterval(async () => {
    // --- Cron tasks ---
    const now = new Date();
    const tasks = cronStore.listAll();
    for (const task of tasks) {
      if (shouldRun(task.schedule, now, task.last_run_at)) {
        const platform = apiContext.platforms.get(task.thread_id);
        if (!platform) {
          log.warn(`Cron ${task.id} skipped — no platform context for ${task.thread_id}`);
          continue;
        }

        log.info(`[#${platform.threadName}] Cron firing: ${task.id} — ${task.description || task.prompt.slice(0, 40)}`);
        cronStore.updateLastRun(task.id);

        if (!queue.isActive(task.thread_id)) {
          processMessage(platform, task.prompt, config, store, queue, apiPort, settings, followupStore, apiContext);
        } else {
          queue.enqueue(task.thread_id, task.prompt);
        }
      }
    }

    // --- Followup checker ---
    const dueFollowups = followupStore.getDue();
    for (const followup of dueFollowups) {
      const platform = apiContext.platforms.get(followup.thread_id);
      if (!platform) {
        log.warn(`Followup skipped — no platform context for ${followup.thread_id}`);
        followupStore.delete(followup.thread_id);
        continue;
      }

      log.info(`[#${platform.threadName}] Followup firing`);
      followupStore.delete(followup.thread_id); // one-shot: delete before firing

      if (!queue.isActive(followup.thread_id)) {
        processMessage(platform, FOLLOWUP_PROMPT, config, store, queue, apiPort, settings, followupStore, apiContext);
      } else {
        queue.enqueue(followup.thread_id, FOLLOWUP_PROMPT);
      }
    }
  }, 60_000);

  return {
    stop: () => clearInterval(interval),
  };
}
