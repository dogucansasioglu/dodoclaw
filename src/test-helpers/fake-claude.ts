#!/usr/bin/env bun
/**
 * Fake Claude CLI for testing ralph.
 * Outputs stream-json format based on env vars:
 *
 * FAKE_CLAUDE_RESULT  - the result text (default: "done")
 * FAKE_CLAUDE_EXIT    - exit code (default: 0)
 * FAKE_CLAUDE_DELAY   - delay in ms before output (default: 0)
 * FAKE_CLAUDE_ERROR   - if set, output an error result instead
 * FAKE_CLAUDE_LOG_ARGS - if set, write args to this file path
 */

const args = process.argv.slice(2);

// Log args if requested
const logArgsPath = process.env.FAKE_CLAUDE_LOG_ARGS;
if (logArgsPath) {
  await Bun.write(logArgsPath, JSON.stringify(args));
}

const resultText = process.env.FAKE_CLAUDE_RESULT ?? "done";
const exitCode = parseInt(process.env.FAKE_CLAUDE_EXIT ?? "0");
const delay = parseInt(process.env.FAKE_CLAUDE_DELAY ?? "0");
const errorMsg = process.env.FAKE_CLAUDE_ERROR;

if (delay > 0) {
  await new Promise((r) => setTimeout(r, delay));
}

// Output init message
console.log(JSON.stringify({
  type: "system",
  subtype: "init",
  session_id: "fake-session-123",
}));

if (errorMsg) {
  console.log(JSON.stringify({
    type: "result",
    subtype: "error",
    error: errorMsg,
  }));
} else {
  // Output assistant text
  console.log(JSON.stringify({
    type: "assistant",
    subtype: "text",
    content: resultText,
  }));

  // Output result
  console.log(JSON.stringify({
    type: "result",
    subtype: "success",
    result: resultText,
  }));
}

process.exit(exitCode);
