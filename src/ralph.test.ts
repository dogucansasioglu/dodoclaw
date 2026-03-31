import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { runRalphIteration, startRalphLoop, createRalphBranch, createRalphPR, formatIterationUpdate, formatRalphSummary, RalphManager } from "./ralph";
import type { RalphSummary, RalphIterationUpdate } from "./ralph";
import { join } from "path";
import { mkdtempSync, rmSync } from "fs";

const FAKE_CLAUDE = join(import.meta.dir, "test-helpers", "fake-claude.ts");
const fakeClaude = `bun ${FAKE_CLAUDE}`;

describe("runRalphIteration", () => {
  test("successful iteration returns success:true, complete:false", async () => {
    const result = await runRalphIteration({
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      prompt: "do something",
      env: { FAKE_CLAUDE_RESULT: "implemented feature X" },
    });

    expect(result.success).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.error).toBeUndefined();
  });

  test("detects COMPLETE signal and returns complete:true", async () => {
    const result = await runRalphIteration({
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      prompt: "do something",
      env: { FAKE_CLAUDE_RESULT: "All done! <promise>COMPLETE</promise>" },
    });

    expect(result.success).toBe(true);
    expect(result.complete).toBe(true);
  });

  test("returns error when claude outputs error result", async () => {
    const result = await runRalphIteration({
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      prompt: "do something",
      env: { FAKE_CLAUDE_ERROR: "Something broke" },
    });

    expect(result.success).toBe(false);
    expect(result.complete).toBe(false);
    expect(result.error).toContain("Something broke");
  });

  test("returns error when process exits with non-zero code", async () => {
    const result = await runRalphIteration({
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      prompt: "do something",
      env: { FAKE_CLAUDE_EXIT: "1" },
    });

    expect(result.success).toBe(false);
    expect(result.complete).toBe(false);
    expect(result.error).toContain("Exit code 1");
  });

  test("abort signal stops the process", async () => {
    const controller = new AbortController();

    // Start with a delay so we have time to abort
    const promise = runRalphIteration({
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      prompt: "do something",
      signal: controller.signal,
      env: { FAKE_CLAUDE_DELAY: "5000" },
    });

    // Abort after 50ms
    setTimeout(() => controller.abort(), 50);

    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toContain("Aborted");
  });

  test("spawns with correct CLI args (fresh session, no resume)", async () => {
    const argsFile = join(import.meta.dir, ".test-args.json");

    await runRalphIteration({
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      prompt: "test prompt here",
      env: { FAKE_CLAUDE_LOG_ARGS: argsFile },
    });

    const logged = JSON.parse(await Bun.file(argsFile).text()) as string[];

    // Must have -p with the prompt
    const pIdx = logged.indexOf("-p");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(logged[pIdx + 1]).toBe("test prompt here");

    // Must have --dangerously-skip-permissions
    expect(logged).toContain("--dangerously-skip-permissions");

    // Must have --output-format stream-json
    const fmtIdx = logged.indexOf("--output-format");
    expect(logged[fmtIdx + 1]).toBe("stream-json");

    // Must have --session-id (fresh, not --resume)
    expect(logged).toContain("--session-id");
    expect(logged).not.toContain("--resume");

    // Must NOT have --append-system-prompt
    expect(logged).not.toContain("--append-system-prompt");

    // Cleanup
    await Bun.write(argsFile, "");
  });
});

describe("startRalphLoop", () => {
  test("runs N iterations and returns correct summary", async () => {
    const summary = await startRalphLoop({
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      iterations: 3,
      prompt: "do task",
      env: { FAKE_CLAUDE_RESULT: "did a task" },
    });

    expect(summary.totalIterations).toBe(3);
    expect(summary.iterationsRun).toBe(3);
    expect(summary.successCount).toBe(3);
    expect(summary.failCount).toBe(0);
    expect(summary.complete).toBe(false);
    expect(summary.aborted).toBe(false);
  });

  test("stops early when COMPLETE signal received", async () => {
    // Fake claude always returns COMPLETE, loop should stop after 1
    const summary = await startRalphLoop({
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      iterations: 5,
      prompt: "do task",
      env: { FAKE_CLAUDE_RESULT: "<promise>COMPLETE</promise>" },
    });

    expect(summary.iterationsRun).toBe(1);
    expect(summary.complete).toBe(true);
    expect(summary.successCount).toBe(1);
  });

  test("retries failed iteration up to 3 times then skips", async () => {
    const updates: any[] = [];

    const summary = await startRalphLoop({
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      iterations: 1,
      prompt: "do task",
      env: { FAKE_CLAUDE_ERROR: "broken" },
      onIterationComplete: (u) => updates.push(u),
    });

    // Should have tried 3 times (1 + 2 retries), all failed
    expect(summary.failCount).toBe(1);
    expect(summary.successCount).toBe(0);
    expect(summary.iterationsRun).toBe(1);

    // The callback should report the final state with retryCount
    expect(updates.length).toBe(1);
    expect(updates[0].success).toBe(false);
    expect(updates[0].retryCount).toBe(2);
  });

  test("abort signal stops loop between iterations", async () => {
    const controller = new AbortController();
    const updates: any[] = [];

    // Abort after first iteration completes
    const summary = await startRalphLoop({
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      iterations: 10,
      prompt: "do task",
      env: { FAKE_CLAUDE_RESULT: "done" },
      onIterationComplete: (u) => {
        updates.push(u);
        // Abort after first iteration
        controller.abort();
      },
      signal: controller.signal,
    });

    expect(summary.aborted).toBe(true);
    expect(summary.iterationsRun).toBe(1);
  });

  test("onIterationComplete fires after each iteration", async () => {
    const updates: any[] = [];

    await startRalphLoop({
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      iterations: 3,
      prompt: "do task",
      env: { FAKE_CLAUDE_RESULT: "done" },
      onIterationComplete: (u) => updates.push(u),
    });

    expect(updates.length).toBe(3);
    expect(updates[0].iteration).toBe(1);
    expect(updates[1].iteration).toBe(2);
    expect(updates[2].iteration).toBe(3);
    expect(updates.every((u: any) => u.totalIterations === 3)).toBe(true);
    expect(updates.every((u: any) => u.success === true)).toBe(true);
  });
});

describe("createRalphBranch", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(import.meta.dir, ".tmp-git-"));
    // Init a git repo with an initial commit
    Bun.spawnSync(["git", "init"], { cwd: tmpDir });
    Bun.spawnSync(["git", "config", "user.email", "test@test.com"], { cwd: tmpDir });
    Bun.spawnSync(["git", "config", "user.name", "Test"], { cwd: tmpDir });
    Bun.spawnSync(["git", "commit", "--allow-empty", "-m", "init"], { cwd: tmpDir });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates a ralph/ branch and returns branch name", async () => {
    const branchName = await createRalphBranch(tmpDir);

    expect(branchName).toMatch(/^ralph\//);

    // Verify we're on that branch
    const result = Bun.spawnSync(["git", "branch", "--show-current"], { cwd: tmpDir });
    const currentBranch = new TextDecoder().decode(result.stdout).trim();
    expect(currentBranch).toBe(branchName);
  });
});

describe("createRalphPR", () => {
  test("builds correct gh command args", async () => {
    const summary: RalphSummary = {
      totalIterations: 10,
      iterationsRun: 7,
      successCount: 6,
      failCount: 1,
      complete: true,
      aborted: false,
    };

    // We can't actually run gh pr create without a real repo,
    // but we can test the PR body generation
    const { buildPRBody } = await import("./ralph");
    const body = buildPRBody(summary);

    expect(body).toContain("7");      // iterations run
    expect(body).toContain("6");      // success
    expect(body).toContain("1");      // fail
    expect(body).toContain("COMPLETE");
  });
});

describe("formatIterationUpdate", () => {
  test("formats successful iteration", () => {
    const update: RalphIterationUpdate = {
      iteration: 3,
      totalIterations: 10,
      success: true,
      complete: false,
      retryCount: 0,
    };
    const msg = formatIterationUpdate(update);
    expect(msg).toContain("3/10");
    expect(msg).toContain("done");
  });

  test("formats failed iteration with retry count", () => {
    const update: RalphIterationUpdate = {
      iteration: 5,
      totalIterations: 10,
      success: false,
      complete: false,
      error: "test broke",
      retryCount: 2,
    };
    const msg = formatIterationUpdate(update);
    expect(msg).toContain("5/10");
    expect(msg).toContain("failed");
    expect(msg).toContain("3 attempts");
  });

  test("formats COMPLETE iteration", () => {
    const update: RalphIterationUpdate = {
      iteration: 7,
      totalIterations: 10,
      success: true,
      complete: true,
      retryCount: 0,
    };
    const msg = formatIterationUpdate(update);
    expect(msg).toContain("COMPLETE");
  });
});

describe("formatRalphSummary", () => {
  test("formats complete summary", () => {
    const summary: RalphSummary = {
      totalIterations: 10,
      iterationsRun: 8,
      successCount: 7,
      failCount: 1,
      complete: true,
      aborted: false,
    };
    const msg = formatRalphSummary(summary, "https://github.com/test/pr/1");
    expect(msg).toContain("8");
    expect(msg).toContain("7");
    expect(msg).toContain("1");
    expect(msg).toContain("https://github.com/test/pr/1");
  });

  test("formats aborted summary without PR link", () => {
    const summary: RalphSummary = {
      totalIterations: 10,
      iterationsRun: 3,
      successCount: 3,
      failCount: 0,
      complete: false,
      aborted: true,
    };
    const msg = formatRalphSummary(summary);
    expect(msg).toContain("aborted");
    expect(msg).toContain("3");
  });
});

describe("RalphManager", () => {
  test("start begins a ralph loop and isRunning returns true", async () => {
    const manager = new RalphManager();
    const updates: any[] = [];

    const done = manager.start({
      threadId: "test-thread",
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      iterations: 2,
      prompt: "do task",
      env: { FAKE_CLAUDE_RESULT: "did it" },
      onIterationComplete: (u) => updates.push(u),
      onDone: () => {},
    });

    expect(manager.isRunning("test-thread")).toBe(true);

    await done;

    expect(manager.isRunning("test-thread")).toBe(false);
    expect(updates.length).toBe(2);
  });

  test("stop aborts a running ralph loop", async () => {
    const manager = new RalphManager();

    const done = manager.start({
      threadId: "test-thread-2",
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      iterations: 100,
      prompt: "do task",
      env: { FAKE_CLAUDE_RESULT: "did it" },
      onIterationComplete: () => {
        // Stop after first iteration callback
        manager.stop("test-thread-2");
      },
      onDone: () => {},
    });

    const summary = await done;

    expect(summary!.aborted).toBe(true);
    expect(summary!.iterationsRun).toBe(1);
    expect(manager.isRunning("test-thread-2")).toBe(false);
  });

  test("cannot start two loops on same thread", () => {
    const manager = new RalphManager();

    manager.start({
      threadId: "test-thread-3",
      claudePath: fakeClaude,
      workingDir: import.meta.dir,
      iterations: 100,
      prompt: "do task",
      env: { FAKE_CLAUDE_DELAY: "5000" },
      onIterationComplete: () => {},
      onDone: () => {},
    });

    expect(() => {
      manager.start({
        threadId: "test-thread-3",
        claudePath: fakeClaude,
        workingDir: import.meta.dir,
        iterations: 5,
        prompt: "do task",
        env: { FAKE_CLAUDE_RESULT: "x" },
        onIterationComplete: () => {},
        onDone: () => {},
      });
    }).toThrow();

    // Cleanup
    manager.stop("test-thread-3");
  });
});
