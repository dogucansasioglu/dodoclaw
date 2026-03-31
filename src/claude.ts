import { randomUUID } from "crypto";
import { log } from "./logger";

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

/**
 * Format and print a stream-json event to terminal.
 * Mimics claude code's terminal output for readability.
 */
function logStreamEvent(tag: string, msg: any): void {
  if (msg.type === "system" && msg.subtype === "init") {
    const model = msg.model ?? "unknown";
    const sessionId = (msg.session_id ?? "").slice(0, 8);
    console.log(`${c.dim}${tag}${c.reset} ${c.cyan}Session ${sessionId}...${c.reset} ${c.dim}(${model})${c.reset}`);
  } else if (msg.type === "assistant" && msg.message?.content) {
    for (const block of msg.message.content) {
      if (block.type === "text" && block.text) {
        // Print text output — show full text, not truncated
        const lines = block.text.split("\n");
        for (const line of lines) {
          console.log(`${c.dim}${tag}${c.reset} ${line}`);
        }
      } else if (block.type === "tool_use") {
        const name = block.name ?? "unknown";
        const input = block.input ?? {};
        let detail = "";

        if (name === "Bash") {
          detail = input.command ?? "";
        } else if (name === "Read") {
          detail = input.file_path ?? "";
        } else if (name === "Edit" || name === "Write") {
          detail = input.file_path ?? "";
        } else if (name === "Grep") {
          detail = `"${input.pattern ?? ""}" ${input.path ?? ""}`;
        } else if (name === "Glob") {
          detail = input.pattern ?? "";
        } else if (name === "Agent") {
          detail = input.description ?? input.prompt?.slice(0, 80) ?? "";
        } else if (name === "Skill") {
          detail = input.skill ?? "";
        } else {
          detail = JSON.stringify(input).slice(0, 120);
        }

        console.log(`${c.dim}${tag}${c.reset} ${c.magenta}${c.bold}${name}${c.reset} ${c.dim}${detail}${c.reset}`);
      }
    }
  } else if (msg.type === "user" && msg.message?.content) {
    for (const block of msg.message.content) {
      if (block.type === "tool_result") {
        if (block.is_error) {
          const errText = typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? "");
          console.log(`${c.dim}${tag}${c.reset} ${c.red}✗ Error: ${errText.slice(0, 200)}${c.reset}`);
        }
        // Skip success results — too verbose
      }
    }
  } else if (msg.type === "result") {
    const cost = msg.total_cost_usd ? `$${msg.total_cost_usd.toFixed(4)}` : "";
    const duration = msg.duration_ms ? `${(msg.duration_ms / 1000).toFixed(1)}s` : "";
    if (msg.subtype === "success") {
      console.log(`${c.dim}${tag}${c.reset} ${c.green}✓ Done${c.reset} ${c.dim}(${duration}, ${cost})${c.reset}`);
    } else if (msg.subtype === "error") {
      console.log(`${c.dim}${tag}${c.reset} ${c.red}✗ Error: ${msg.error ?? "unknown"}${c.reset}`);
    }
  }
}

export interface ClaudeResult {
  sessionId: string;
  text: string;
}

export interface ClaudeOptions {
  prompt: string;
  resumeSessionId?: string;
  claudePath: string;
  workingDir: string;
  apiPort: number;
  threadId: string;
  threadName?: string;
  signal?: AbortSignal;
  userTimezone?: string;
  messageTimestamp?: number;
}

function formatUserLocalTime(timestamp: number, timezone: string): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(date);
}

function buildSystemPrompt(apiPort: number, threadId: string, userTimezone?: string, messageTimestamp?: number): string {
  const base = `http://localhost:${apiPort}/thread/${threadId}`;
  return [
    "You are connected to a Discord thread. The user is chatting with you from Discord.",
    "IMPORTANT: You MUST send ALL your responses via the Discord API using curl. The user CANNOT see your stdout. Use the Bash tool with curl for every message.",
    "",
    "Available endpoints:",
    `• Send message: curl -s -X POST ${base}/reply -H 'Content-Type: application/json' -d '{"text":"your message"}'`,
    `• Send file: curl -s -X POST ${base}/send-file -H 'Content-Type: application/json' -d '{"file_path":"/absolute/path","message":"optional caption"}'`,
    `• React with emoji: curl -s -X POST ${base}/react -H 'Content-Type: application/json' -d '{"emoji":"👍"}'`,
    `• Create cron job: curl -s -X POST ${base}/cron -H 'Content-Type: application/json' -d '{"schedule":"0 9 * * *","prompt":"do something","description":"daily task"}'`,
    `• List cron jobs: curl -s ${base}/cron`,
    `• Delete cron job: curl -s -X DELETE ${base}/cron -H 'Content-Type: application/json' -d '{"id":"task_id"}'`,
    "",
    "Guidelines:",
    "- Send multiple reply messages as you work to show progress",
    "- Keep messages concise and Discord-friendly (markdown supported)",
    "- For long responses, split into multiple reply calls",
    "- You can still use all your normal tools (Read, Edit, Bash, Grep, etc.) for coding tasks",
    ...(userTimezone && messageTimestamp
      ? [
          "",
          `userLocalTime: ${formatUserLocalTime(messageTimestamp, userTimezone)} (${userTimezone})`,
        ]
      : []),
  ].join("\n");
}

// Idle timeout: kill process if no output for this many ms
const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

export async function runClaude(options: ClaudeOptions): Promise<ClaudeResult> {
  const {
    prompt,
    resumeSessionId,
    claudePath,
    workingDir,
    apiPort,
    threadId,
    threadName,
    signal,
    userTimezone,
    messageTimestamp,
  } = options;

  const tag = threadName ? `[#${threadName}]` : `[${threadId.slice(0, 8)}]`;
  const newSessionId = resumeSessionId ? undefined : randomUUID();

  const systemPrompt = buildSystemPrompt(apiPort, threadId, userTimezone, messageTimestamp);

  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--append-system-prompt",
    systemPrompt,
    "--dangerously-skip-permissions",
  ];

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  } else if (newSessionId) {
    args.push("--session-id", newSessionId);
  }

  log.claude(`${tag} Spawning: claude -p "${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}"`);

  const proc = Bun.spawn([claudePath, ...args], {
    cwd: workingDir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  if (signal) {
    signal.addEventListener("abort", () => proc.kill());
  }

  let sessionId = resumeSessionId ?? newSessionId!;
  let resultText = "";
  let lastActivityTime = Date.now();
  let idleKilled = false;

  // Idle watchdog: checks every 30s if there's been activity
  const idleWatchdog = setInterval(() => {
    const idleMs = Date.now() - lastActivityTime;
    if (idleMs >= IDLE_TIMEOUT_MS) {
      log.warn(`${tag} Idle for ${(idleMs / 1000).toFixed(0)}s — killing process`);
      idleKilled = true;
      proc.kill();
      clearInterval(idleWatchdog);
    }
  }, 30_000);

  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lastActivityTime = Date.now();
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

        // Stream formatted output to terminal
        logStreamEvent(tag, msg);

        if (msg.type === "system" && msg.subtype === "init") {
          if (msg.session_id) sessionId = msg.session_id;
        } else if (msg.type === "result") {
          if (msg.subtype === "success") {
            resultText = msg.result ?? "";
          } else if (msg.subtype === "error") {
            throw new Error(msg.error ?? "Claude returned an error");
          }
        }
      }
    }
  } finally {
    clearInterval(idleWatchdog);
    reader.releaseLock();
  }

  const exitCode = await proc.exited;

  if (idleKilled) {
    throw new Error("Claude process killed: no output for 2 minutes");
  }

  if (exitCode !== 0 && !signal?.aborted) {
    const stderrText = await new Response(proc.stderr).text();
    log.error(`${tag} Exit ${exitCode}: ${stderrText.slice(0, 300)}`);
    throw new Error(`Claude exited with code ${exitCode}: ${stderrText.slice(0, 500)}`);
  }

  return { sessionId, text: resultText };
}

export interface BtwOptions {
  prompt: string;
  activeSessionId: string;
  claudePath: string;
  workingDir: string;
  apiPort: number;
  threadId: string;
  threadName?: string;
  signal?: AbortSignal;
}

function getProjectPath(workingDir: string): string {
  // Convert working dir to Claude Code's project path encoding
  // C:\Users\You\project -> C--Users-You-project
  const normalized = workingDir.replace(/\//g, "\\"); // normalize forward slashes
  return normalized.replace(/[:\\]/g, "-");
}

function buildBtwSystemPrompt(apiPort: number, threadId: string, logPath: string): string {
  const base = `http://localhost:${apiPort}/thread/${threadId}`;
  return [
    "You are connected to a Discord thread. The user is chatting with you from Discord.",
    "IMPORTANT: You MUST send ALL your responses via the Discord API using curl. The user CANNOT see your stdout. Use the Bash tool with curl for every message.",
    "",
    "Available endpoints:",
    `• Send message: curl -s -X POST ${base}/reply -H 'Content-Type: application/json' -d '{"text":"your message"}'`,
    `• React with emoji: curl -s -X POST ${base}/react -H 'Content-Type: application/json' -d '{"emoji":"👍"}'`,
    "",
    "THIS IS A /btw (by the way) SESSION.",
    "There is currently another Claude session actively working in this thread.",
    `That session's full conversation log (JSONL format) is at: ${logPath}`,
    "",
    "Your job: Read that log file to understand what the other session is doing, then answer the user's question.",
    "This is a ONE-SHOT session — answer and you're done. Keep it concise.",
    "Do NOT modify any files or make changes — you are read-only, just answering a side question.",
  ].join("\n");
}

export async function runBtwClaude(options: BtwOptions): Promise<ClaudeResult> {
  const {
    prompt,
    activeSessionId,
    claudePath,
    workingDir,
    apiPort,
    threadId,
    threadName,
    signal,
  } = options;

  const tag = threadName ? `[#${threadName}]` : `[${threadId.slice(0, 8)}]`;

  const projectPath = getProjectPath(workingDir);
  const homeDir = process.env.USERPROFILE ?? process.env.HOME ?? "~";
  const logPath = `${homeDir}/.claude/projects/${projectPath}/${activeSessionId}.jsonl`;

  const systemPrompt = buildBtwSystemPrompt(apiPort, threadId, logPath);

  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--append-system-prompt",
    systemPrompt,
    "--dangerously-skip-permissions",
  ];

  log.claude(`${tag} [BTW] Spawning btw session for: "${prompt.slice(0, 60)}"`);

  const proc = Bun.spawn([claudePath, ...args], {
    cwd: workingDir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  if (signal) {
    signal.addEventListener("abort", () => proc.kill());
  }

  let sessionId = randomUUID();
  let resultText = "";
  let lastActivityTime = Date.now();
  let idleKilled = false;

  const idleWatchdog = setInterval(() => {
    const idleMs = Date.now() - lastActivityTime;
    if (idleMs >= IDLE_TIMEOUT_MS) {
      log.warn(`${tag} [BTW] Idle for ${(idleMs / 1000).toFixed(0)}s — killing process`);
      idleKilled = true;
      proc.kill();
      clearInterval(idleWatchdog);
    }
  }, 30_000);

  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lastActivityTime = Date.now();
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

        const btwTag = `${tag} [BTW]`;
        logStreamEvent(btwTag, msg);

        if (msg.type === "system" && msg.subtype === "init") {
          if (msg.session_id) sessionId = msg.session_id;
        } else if (msg.type === "result") {
          if (msg.subtype === "success") {
            resultText = msg.result ?? "";
          } else if (msg.subtype === "error") {
            throw new Error(msg.error ?? "BTW session error");
          }
        }
      }
    }
  } finally {
    clearInterval(idleWatchdog);
    reader.releaseLock();
  }

  const exitCode = await proc.exited;

  if (idleKilled) {
    throw new Error("BTW session killed: no output for 2 minutes");
  }

  if (exitCode !== 0 && !signal?.aborted) {
    const stderrText = await new Response(proc.stderr).text();
    log.error(`${tag} [BTW] Exit ${exitCode}: ${stderrText.slice(0, 300)}`);
    throw new Error(`BTW session exited with code ${exitCode}`);
  }

  log.ok(`${tag} [BTW] Done`);
  return { sessionId, text: resultText };
}
