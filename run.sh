#!/bin/bash
# Claude Claw auto-restart wrapper
# process.exit(0) = restart, process.exit(1) = stop

export PATH="$HOME/.bun/bin:$PATH"

while true; do
  echo "[claw] Starting..."
  bun run src/index.ts
  EXIT_CODE=$?

  if [ $EXIT_CODE -ne 0 ]; then
    echo "[claw] Crashed with code $EXIT_CODE. Stopping."
    break
  fi

  echo "[claw] Restarting in 2s..."
  sleep 2
done
