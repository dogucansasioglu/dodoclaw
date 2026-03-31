// Auto-restart wrapper for Claude Claw
// exit(0) = restart, exit(1) = stop

import { log } from "./logger";

async function start() {
  while (true) {
    log.info("[runner] Starting Claude Claw...");

    const proc = Bun.spawn(["bun", "run", "src/index.ts"], {
      cwd: import.meta.dir + "/..",
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });

    const code = await proc.exited;

    if (code !== 0) {
      log.error(`[runner] Crashed with code ${code}. Stopping.`);
      break;
    }

    log.info("[runner] Restarting in 2s...");
    await Bun.sleep(2000);
  }
}

start();
