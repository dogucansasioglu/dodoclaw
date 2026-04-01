# /setup — Interactive Onboarding

Interactive setup wizard for new dodoclaw installations. Walks the user through configuring their bot step by step.

## Behavior

- Interactive: ask one question at a time, wait for response
- Friendly and encouraging tone
- Can skip optional steps (user says "skip")
- If something fails, diagnose and help fix before continuing
- At the end, give a summary of what was configured

## Steps

### Step 1: Prerequisites Check

Check that required tools are installed:

```bash
bun --version
claude --version
pnpm --version
gh --version
```

For each missing tool:
- **bun**: "Bun is the JavaScript runtime dodoclaw uses. Install: `curl -fsSL https://bun.sh/install | bash`"
- **claude**: "Claude Code CLI is needed for the AI agent. Install: `npm install -g @anthropic-ai/claude-code`"
- **pnpm**: "pnpm is the package manager. Install: `npm install -g pnpm`"
- **gh**: "GitHub CLI is used for repo creation and issue management. Install: https://cli.github.com"

Do not proceed until all are present. Re-check after user says they installed something.

### Step 2: Platform Selection

Ask: "Which platforms do you want to set up?"
- Discord
- Telegram
- Both

At least one is required. The bot can run on Discord only, Telegram only, or both simultaneously.

### Step 3: Discord Bot Setup (if selected)

Ask the user:
1. "What is your Discord bot token?" (they get this from Discord Developer Portal)
2. "What is your Discord Guild ID?" (optional -- right-click server -> Copy Server ID)

Guide through Discord Developer Portal if needed:
1. Go to https://discord.com/developers/applications
2. "New Application" -> name it -> "Bot" tab -> "Reset Token" -> copy token
3. Enable "Message Content Intent" under Privileged Gateway Intents
4. "OAuth2" tab -> "bot" scope -> permissions: Send Messages, Read Messages, Manage Messages, Attach Files, Add Reactions, Use External Emojis, Read Message History
5. Generate invite link, open it, select server

Then:
- Create .env file with DISCORD_TOKEN=<token> and optionally DISCORD_GUILD_ID=<id>
- Run pnpm install if node_modules does not exist

### Step 4: Telegram Bot Setup (if selected)

1. Guide user to Telegram, open @BotFather
2. Send /newbot, follow prompts (name + username ending in _bot)
3. Copy the token BotFather gives

4. Guide user to create a Telegram group:
   - Create new group in Telegram
   - Go to Group Settings -> Topics -> Enable (this makes it a forum/supergroup)
   - Add the bot to the group
   - Make the bot an admin (Group Settings -> Administrators -> add bot)

5. Get chat ID:
   - Ask user to send any message in the group
   - Fetch updates to find chat ID:
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates"
   ```
   - Extract chat.id from the response (will be negative number like -100xxxxx)

Write to .env:
```
TELEGRAM_TOKEN=<token>
TELEGRAM_FORUM_CHAT_ID=<chat_id>
```

### Step 5: GitHub Repo

Ask: "What do you want to name your personal bot repo?" (default: their bot name or "my-discord-bot")

Then:
- gh repo create <name> --private (private by default)
- git init if not already initialized
- Initial commit with all files
- git remote add origin + git push

Explain: "This is YOUR personal repo -- separate from dodoclaw. Your vault, personality, custom shortcodes, and CLAUDE.md all live here."

### Step 6: Personality Creation

Ask questions one at a time:
1. "What should your bot be called?" (name/character)
2. "What language should it speak?" (English, Turkish, Japanese, etc.)
3. "Casual or formal tone?"
4. "Any specific personality traits? (e.g., sarcastic, encouraging, chaotic, chill)"
5. "Who are you? What is your name?"
6. "What do you do? (developer, student, designer, etc.)"
7. "What is your tech stack? (e.g., React, Python, Go)"
8. "What timezone are you in?"
9. "Any preferences for how the bot should interact? (e.g., short messages, lots of emoji, no emoji)"

Based on answers, generate and write:
- **Personality section** in CLAUDE.md -- character description, tone rules, dos and donts
- **User Profile section** in CLAUDE.md -- name, role, stack, timezone, preferences
- **Conversation Style section** in CLAUDE.md -- language, formality, emoji rules

Write the sections into CLAUDE.md, replacing the placeholder text.

### Step 7: Vault Initialization

Create vault structure if not present:
- vault/memory/MEMORY.md -- add user name and timezone as first memory entries
- vault/people/<UserName>.md -- create user profile from Step 6 answers
- Daily log: vault/memory/YYYY-MM-DD.md -- log the setup event

### Step 8: Emoji System (Optional)

Ask: "Do you want to set up custom Discord emojis? (you can always do this later with /add-shortcode)"

If yes:
- Explain: "Upload your custom emojis to your Discord server first, then use /add-shortcode to register them here."
- Guide them through adding 1-2 emojis as a test
- Show them how shortcodes work in messages

If no/skip:
- Explain: "No problem! The bot uses unicode emoji fallbacks automatically. You can add custom emojis anytime with /add-shortcode."

### Step 9: Optional API Keys

Ask: "Do you have a Giphy API key? (optional -- enables the /gif-fetch skill for finding GIFs)"

If yes: add GIPHY_API_KEY=<key> to .env
If no/skip: "You can add this later to .env if you want GIF support."

### Step 10: Test Run

- Run pnpm dev
- Tell the user based on configured platform(s):
  - (Discord) "Go to your Discord server, create a new thread in any channel, and send a test message!"
  - (Telegram) "Go to your Telegram group, open a topic, and send a test message!"
- Wait for them to confirm it works
- If it does not work, help debug (check token, permissions, intents, forum mode, admin status, etc.)

## Completion

After all steps, print a summary:

```
Setup complete! Here is what was configured:

Prerequisites: all installed
Platforms: <Discord / Telegram / both>
Discord bot: <connected / skipped>
Telegram bot: <connected / skipped>
GitHub repo: <repo-url>
Personality: <bot-name> (<language>, <tone>)
Vault: initialized with your profile
Emojis: <configured/skipped>
API keys: <configured/skipped>

Next steps:
- Chat with your bot in Discord threads or Telegram topics
- Add custom emojis: /add-shortcode
- Check available skills: /help
- Customize CLAUDE.md for more personality tweaks
```

## Rules

- Read .env first -- do not overwrite existing values
- Ask before each step, do not auto-run everything
- If a step fails, help debug before moving on
- Show the user what you are adding to .env before writing
- NEVER commit .env to git
- Env var names: TELEGRAM_TOKEN (not TELEGRAM_BOT_TOKEN)
