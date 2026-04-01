export interface Config {
  discordToken?: string;
  telegramToken?: string;
  telegramForumChatId?: string;
  claudePath: string;
  workingDir: string;
  dbPath: string;
}

export function loadConfig(): Config {
  const discordToken = process.env.DISCORD_TOKEN || undefined;
  const telegramToken = process.env.TELEGRAM_TOKEN || undefined;
  const telegramForumChatId = process.env.TELEGRAM_FORUM_CHAT_ID || undefined;

  if (!discordToken && !telegramToken) {
    throw new Error("At least one of DISCORD_TOKEN or TELEGRAM_TOKEN must be set");
  }

  return {
    discordToken,
    telegramToken,
    telegramForumChatId,
    claudePath: process.env.CLAUDE_PATH ?? "claude",
    workingDir: process.env.WORKING_DIR ?? process.cwd(),
    dbPath: process.env.DB_PATH ?? "./dodoclaw.db",
  };
}
