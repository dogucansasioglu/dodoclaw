# dodoclaw Telegram Sync - Ralph Plan

Source repo: C:/Users/Dogucan/Desktop/coding/claude-claw (reference for copying files)
Target repo: C:/Users/Dogucan/Desktop/coding/dodoclaw (where changes go)

---

### Task 1: Add platform abstraction layer
**GitHub Issue:** dogucansasioglu/dodoclaw#1 | **Size:** L | **Blocked by:** Nothing

Copy from claude-claw and adapt for dodoclaw:

1. Copy these NEW files from claude-claw to dodoclaw src/:
   - `src/platform.ts` — copy as-is
   - `src/process.ts` — copy as-is
   - `src/scheduler.ts` — copy as-is

2. REPLACE these dodoclaw files with claude-claw versions (then adjust):
   - `src/api.ts` — copy from claude-claw, verify imports
   - `src/bot.ts` — copy from claude-claw, verify imports
   - `src/claude.ts` — copy from claude-claw, verify imports
   - `src/config.ts` — copy from claude-claw, BUT change dbPath default to `./dodoclaw.db`
   - `src/index.ts` — copy from claude-claw, BUT remove telegram-bot import/startup for now (Task 2 adds it)
   - `src/cron.ts` — copy from claude-claw
   - `src/followup.ts` — copy from claude-claw
   - `src/shortcodes.ts` — copy stripShortcodes function from claude-claw, keep dodoclaw's existing SHORTCODES and resolveEmoji

3. For index.ts: since telegram-bot.ts doesnt exist yet, comment out or conditionally skip the telegram import. Only Discord should work after this task.

4. Run `bun build src/index.ts --no-bundle --outdir /tmp/check 2>&1` to verify TypeScript compiles.

**IMPORTANT:** Read the claude-claw version of each file first, then read the dodoclaw version, then write the merged result. Do NOT blindly copy — dodoclaw may have dodoclaw-specific things (like resolveEmoji, dbPath defaults) that must be preserved.

**AC:**
- [ ] New files: platform.ts, process.ts, scheduler.ts
- [ ] Updated files: api.ts, bot.ts, claude.ts, config.ts, index.ts, cron.ts, followup.ts, shortcodes.ts
- [ ] Discord bot works as before
- [ ] TypeScript compiles clean
- [ ] dbPath default is ./dodoclaw.db

**Status:** complete

---

### Task 2: Add Telegram bot with grammy
**GitHub Issue:** dogucansasioglu/dodoclaw#2 | **Size:** M | **Blocked by:** Task 1

1. Run `pnpm add grammy` in dodoclaw directory
2. Copy `src/telegram-bot.ts` from claude-claw to dodoclaw — copy as-is
3. Update `src/index.ts`:
   - Uncomment/add telegram-bot import
   - If telegramToken present: createTelegramBot() + bot.start()
   - Graceful shutdown: telegramBot.stop()
4. Update `.env.example` — add TELEGRAM_TOKEN and TELEGRAM_FORUM_CHAT_ID
5. Run TypeScript check to verify

**AC:**
- [ ] grammy in package.json
- [ ] telegram-bot.ts exists
- [ ] index.ts starts Telegram if token present
- [ ] .env.example updated
- [ ] TypeScript compiles

**Status:** complete

---

### Task 3: Update setup skill with Telegram steps
**GitHub Issue:** dogucansasioglu/dodoclaw#3 | **Size:** M | **Blocked by:** Task 2

Read dodoclaw's current setup skill at `.claude/skills/setup/SKILL.md` and ADD Telegram steps while keeping ALL existing steps:

Updated flow:
1. Prerequisites (keep existing)
2. **Platform Selection** (NEW — add after prerequisites, before Discord setup)
   - Ask: Discord, Telegram, or both?
   - At least one required
3. Discord Bot Setup (keep existing, make conditional)
4. **Telegram Bot Setup** (NEW — add after Discord):
   - BotFather: /newbot, token
   - Create supergroup, enable topics/forum mode
   - Add bot as admin
   - TELEGRAM_TOKEN to .env
   - Get chat ID via getUpdates
   - TELEGRAM_FORUM_CHAT_ID to .env
5. GitHub Repo (keep existing)
6. Personality Creation (keep existing — all 9 questions)
7. Vault Init (keep existing)
8. Emoji System (keep existing)
9. API Keys (keep existing)
10. Test Run (update — add Telegram test alongside Discord)
11. Completion summary (update — add Telegram status)

**IMPORTANT:** Do NOT remove or simplify any existing steps. dodoclaw's personality creation and vault init are more detailed than claude-claw's and must stay.

**AC:**
- [ ] Platform selection added
- [ ] Telegram setup steps added
- [ ] All existing steps preserved unchanged
- [ ] Test run includes Telegram
- [ ] Completion summary includes Telegram

**Status:** incomplete
