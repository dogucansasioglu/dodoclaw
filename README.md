# dodoclaw

Discord bot framework powered by Claude Code. Custom personality, Obsidian vault memory, skills system, and multi-agent orchestration.

## What is this?

dodoclaw turns Claude Code into a persistent Discord bot with long-term memory, custom personality, and extensible skills. It runs in Discord threads, remembers context across conversations, and can orchestrate multi-step tasks autonomously.

## Features

- **Custom AI personality** — define how your bot talks, its tone, quirks, and character
- **Obsidian vault memory** — long-term memory, people profiles, project notes, daily logs
- **13 built-in skills** — grill-me, TDD, PRD writing, QA, and more
- **Emoji/sticker/GIF shortcodes** — custom Discord emoji system with unicode fallback
- **Ralph** — multi-agent task orchestration (batch GitHub issues, iterative coding)
- **Voice transcription** — faster-whisper GPU transcription for Discord voice messages
- **YouTube transcripts** — extract and analyze video transcripts
- **Instagram downloads** — download reels/posts metadata and video
- **Cron scheduling** — recurring tasks on a schedule
- **Session persistence** — conversation context preserved across Discord threads

## Prerequisites

- [Bun](https://bun.sh) — JavaScript runtime
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — CLI (`npm install -g @anthropic-ai/claude-code`)
- [pnpm](https://pnpm.io) — package manager
- Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- [GitHub CLI](https://cli.github.com) — for setup and issue management

## Quick Start

```bash
git clone https://github.com/dogucansasioglu/dodoclaw.git
cd dodoclaw
pnpm install
claude
# then type: /setup
```

The `/setup` skill walks you through everything: Discord connection, personality creation, vault initialization, and a test run.

## Skills

| Skill | Description |
|-------|-------------|
| `/setup` | Interactive onboarding wizard — configure bot, personality, and Discord |
| `/add-shortcode` | Register custom Discord emojis, stickers, or GIFs |
| `/gif-fetch` | Find context-appropriate GIFs via Giphy API |
| `/grill-me` | Stress-test a plan or design with relentless questioning |
| `/write-a-prd` | Convert ideas into structured Product Requirements Documents |
| `/prd-to-issues` | Decompose a PRD into GitHub issues with dependencies |
| `/tdd` | Test-Driven Development enforcement (red-green-refactor) |
| `/qa` | Generate comprehensive QA plans from branch commits |
| `/memory-keeper` | Vault memory management — daily logs, people, projects |
| `/voice-transcribe` | Transcribe Discord voice messages (faster-whisper, GPU) |
| `/youtube` | Extract and analyze YouTube video transcripts |
| `/instagram` | Download Instagram reels/posts with metadata |
| `/improve-codebase-architecture` | Analyze and suggest codebase structure improvements |

## Running the Bot

### Development

```bash
pnpm dev
```

### Production

```bash
./run.sh
```

The `run.sh` wrapper auto-restarts the bot on clean exits (used for `/restart` command).

### Running with Claude Code

The bot spawns Claude Code processes for each conversation. It requires `--dangerously-skip-permissions` to function autonomously — this flag allows Claude Code to execute tools (file reads, writes, bash commands, web searches) without prompting for each action. This is necessary because the bot runs unattended, responding to Discord messages without a human approving each tool call.

**What this means:** The bot has full access to your filesystem and can execute arbitrary commands within the working directory. Only run it in an environment you trust, and review the CLAUDE.md personality instructions carefully.

## License

MIT

