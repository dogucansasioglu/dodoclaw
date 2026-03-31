import { randomUUID, randomBytes } from "crypto";
import { log } from "./logger";

export interface RalphIterationConfig {
  claudePath: string;
  workingDir: string;
  prompt: string;
  signal?: AbortSignal;
  env?: Record<string, string>;
}

export interface RalphIterationResult {
  success: boolean;
  complete: boolean;
  error?: string;
}

export async function runRalphIteration(config: RalphIterationConfig): Promise<RalphIterationResult> {
  const { claudePath, workingDir, prompt, signal, env } = config;
  const sessionId = randomUUID();

  const [cmd, ...cmdArgs] = claudePath.split(" ");
  const args = [
    ...cmdArgs,
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
    "--session-id",
    sessionId,
  ];

  log.info(`[ralph] Starting iteration (session: ${sessionId.slice(0, 8)}...)`);

  const proc = Bun.spawn([cmd, ...args], {
    cwd: workingDir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });

  if (signal) {
    signal.addEventListener("abort", () => proc.kill());
  }

  let resultText = "";

  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;

      for (const line of lines) {
        if (!line.trim()) continue;

        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }

        if (msg.type === "result") {
          if (msg.subtype === "success") {
            resultText = msg.result ?? "";
          } else if (msg.subtype === "error") {
            return { success: false, complete: false, error: msg.error ?? "Unknown error" };
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const exitCode = await proc.exited;

  if (exitCode !== 0 && !signal?.aborted) {
    const stderrText = await new Response(proc.stderr).text();
    return { success: false, complete: false, error: `Exit code ${exitCode}: ${stderrText.slice(0, 500)}` };
  }

  if (signal?.aborted) {
    return { success: false, complete: false, error: "Aborted" };
  }

  const complete = resultText.includes("<promise>COMPLETE</promise>");

  log.ok(`[ralph] Iteration done (complete: ${complete})`);

  return { success: true, complete };
}

export interface RalphLoopConfig {
  claudePath: string;
  workingDir: string;
  iterations: number;
  prompt: string;
  signal?: AbortSignal;
  env?: Record<string, string>;
  onIterationComplete?: (update: RalphIterationUpdate) => void;
}

export interface RalphIterationUpdate {
  iteration: number;
  totalIterations: number;
  success: boolean;
  complete: boolean;
  error?: string;
  retryCount: number;
}

export interface RalphSummary {
  totalIterations: number;
  iterationsRun: number;
  successCount: number;
  failCount: number;
  complete: boolean;
  aborted: boolean;
}

const MAX_RETRIES = 2;

export async function startRalphLoop(config: RalphLoopConfig): Promise<RalphSummary> {
  const { claudePath, workingDir, iterations, prompt, signal, env, onIterationComplete } = config;

  let iterationsRun = 0;
  let successCount = 0;
  let failCount = 0;
  let complete = false;
  let aborted = false;

  log.info(`[ralph] Starting loop: ${iterations} iterations`);

  for (let i = 1; i <= iterations; i++) {
    if (signal?.aborted) {
      aborted = true;
      break;
    }

    let result: RalphIterationResult | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      result = await runRalphIteration({ claudePath, workingDir, prompt, signal, env });

      if (result.success) break;

      if (attempt < MAX_RETRIES) {
        retryCount = attempt + 1;
        log.warn(`[ralph] Iteration ${i} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying...`);
      } else {
        retryCount = MAX_RETRIES;
      }
    }

    iterationsRun++;

    if (result!.success) {
      successCount++;
    } else {
      failCount++;
    }

    onIterationComplete?.({
      iteration: i,
      totalIterations: iterations,
      success: result!.success,
      complete: result!.complete,
      error: result!.error,
      retryCount,
    });

    if (result!.complete) {
      complete = true;
      break;
    }

    // Check abort after iteration
    if (signal?.aborted) {
      aborted = true;
      break;
    }
  }

  const summary: RalphSummary = { totalIterations: iterations, iterationsRun, successCount, failCount, complete, aborted };
  log.ok(`[ralph] Loop done: ${iterationsRun} run, ${successCount} ok, ${failCount} fail, complete=${complete}, aborted=${aborted}`);

  return summary;
}

export async function createRalphBranch(workingDir: string): Promise<string> {
  const id = randomBytes(3).toString("hex");
  const branchName = `ralph/${id}`;

  const result = Bun.spawnSync(["git", "checkout", "-b", branchName], { cwd: workingDir });

  if (result.exitCode !== 0) {
    const stderr = new TextDecoder().decode(result.stderr);
    throw new Error(`Failed to create branch ${branchName}: ${stderr}`);
  }

  log.ok(`[ralph] Created branch: ${branchName}`);
  return branchName;
}

export function buildPRBody(summary: RalphSummary): string {
  const status = summary.complete ? "COMPLETE" : summary.aborted ? "ABORTED" : "PARTIAL";
  return [
    `## Ralph Loop Summary`,
    ``,
    `| Stat | Value |`,
    `|------|-------|`,
    `| Status | ${status} |`,
    `| Iterations run | ${summary.iterationsRun} / ${summary.totalIterations} |`,
    `| Successful | ${summary.successCount} |`,
    `| Failed | ${summary.failCount} |`,
    ``,
    `Generated by Ralph loop.`,
  ].join("\n");
}

export function formatIterationUpdate(update: RalphIterationUpdate): string {
  const tag = `Ralph [${update.iteration}/${update.totalIterations}]`;

  if (update.complete) {
    return `${tag} ✅ ALL TASKS COMPLETE`;
  }
  if (update.success) {
    return `${tag} ✅ done`;
  }

  const attempts = update.retryCount + 1;
  return `${tag} ❌ failed (${attempts} attempts) — skipping`;
}

export function formatRalphSummary(summary: RalphSummary, prUrl?: string): string {
  const lines: string[] = [];

  if (summary.aborted) {
    lines.push("Ralph aborted 🛑");
  } else if (summary.complete) {
    lines.push("Ralph bitti 🏁");
  } else {
    lines.push("Ralph durdu ⏹️");
  }

  lines.push(`• ${summary.iterationsRun} iterasyon, ${summary.successCount} basarili, ${summary.failCount} skip`);

  if (summary.complete) {
    lines.push("• Tum tasklar tamamlandi");
  } else {
    const remaining = summary.totalIterations - summary.iterationsRun;
    lines.push(`• ${remaining} iterasyon kaldi`);
  }

  if (prUrl) {
    lines.push(`• PR: ${prUrl}`);
  }

  return lines.join("\n");
}

export async function createRalphPR(workingDir: string, branchName: string, summary: RalphSummary): Promise<string> {
  const status = summary.complete ? "complete" : "partial";
  const title = `Ralph: ${summary.successCount} tasks done (${status})`;
  const body = buildPRBody(summary);

  // Push branch first
  const push = Bun.spawnSync(["git", "push", "-u", "origin", branchName], { cwd: workingDir });
  if (push.exitCode !== 0) {
    const stderr = new TextDecoder().decode(push.stderr);
    throw new Error(`Failed to push branch: ${stderr}`);
  }

  // Create PR
  const pr = Bun.spawnSync(["gh", "pr", "create", "--title", title, "--body", body], { cwd: workingDir });
  if (pr.exitCode !== 0) {
    const stderr = new TextDecoder().decode(pr.stderr);
    throw new Error(`Failed to create PR: ${stderr}`);
  }

  const prUrl = new TextDecoder().decode(pr.stdout).trim();
  log.ok(`[ralph] PR created: ${prUrl}`);
  return prUrl;
}

export interface RalphManagerStartConfig {
  threadId: string;
  claudePath: string;
  workingDir: string;
  iterations: number;
  prompt: string;
  env?: Record<string, string>;
  onIterationComplete: (update: RalphIterationUpdate) => void;
  onDone: (summary: RalphSummary) => void;
}

export class RalphManager {
  private active = new Map<string, AbortController>();

  start(config: RalphManagerStartConfig): Promise<RalphSummary> {
    const { threadId, onDone, onIterationComplete, ...loopConfig } = config;

    if (this.active.has(threadId)) {
      throw new Error(`Ralph already running on thread ${threadId}`);
    }

    const controller = new AbortController();
    this.active.set(threadId, controller);

    const promise = startRalphLoop({
      ...loopConfig,
      signal: controller.signal,
      onIterationComplete,
    }).then((summary) => {
      this.active.delete(threadId);
      onDone(summary);
      return summary;
    });

    return promise;
  }

  stop(threadId: string): boolean {
    const controller = this.active.get(threadId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  isRunning(threadId: string): boolean {
    return this.active.has(threadId);
  }
}
