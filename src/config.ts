export interface Config {
  discordToken: string;
  claudePath: string;
  workingDir: string;
  dbPath: string;
}

export function loadConfig(): Config {
  const discordToken = process.env.DISCORD_TOKEN;
  if (!discordToken) {
    throw new Error("DISCORD_TOKEN environment variable is required");
  }

  return {
    discordToken,
    claudePath: process.env.CLAUDE_PATH ?? "claude",
    workingDir: process.env.WORKING_DIR ?? process.cwd(),
    dbPath: process.env.DB_PATH ?? "./dodoclaw.db",
  };
}
