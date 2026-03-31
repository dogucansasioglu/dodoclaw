# Cold Email Autoresearch - Implementation Plan

PRD: https://github.com/dogucansasioglu/claude-claw/issues/12

## Issues (ordered by dependency)

### Phase 1: Foundation
- [x] #1 - Project scaffolding + SQLite lead database + import (M) — BLOCKS ALL
  - New directory for autoresearch agent (separate from claude-claw bot code)
  - Vitest config + TypeScript/Bun setup
  - SQLite leads table with full schema
  - Dynamic field support (ALTER TABLE)
  - Lead import from CSV/JSON
  - Anti-spam query helper (7-day cooldown, 30-day after 2, priority ordering)
  - **Acceptance:** project scaffolded, schema created, CSV import works, anti-spam query correct, all TDD

### Phase 2: Data Layer (depends on #1)
- [x] #2 - ChromaDB setup + embedding pipeline + semantic search (M) — blocked by #1
  - Local ChromaDB instance (Python)
  - Haiku text cleaning: raw website text -> website_summary
  - Embed website_summary + structured fields
  - Semantic search: natural language query -> lead IDs
  - Combined filtering: vector similarity + SQL filters
  - Update embeddings when fields change
  - **Acceptance:** ChromaDB running, Haiku cleaning works, semantic search works, embeddings update, all TDD

- [x] #3 - Enrichment system: 4 types + chaining + backlog (L) — blocked by #1, #2
  - External (web scrape, sample-first 50-100 leads)
  - Derived (LLM transforms fields)
  - Computed (SQL calculations)
  - Semantic (vector DB similarity)
  - Dynamic field creation (ALTER TABLE + embedding update)
  - Enrichment chaining (external -> derived -> semantic)
  - Backlog logging for failures
  - **Acceptance:** all 4 types work, dynamic fields, sample-first, chaining, backlog logging, all TDD

### Phase 3: Strategy & Selection (depends on #1, #2)
- [x] #4 - Strategy generation engine + knowledge sources (M) — blocked by #1, #2
  - Load email-guide.md + company-profile.md
  - Learnings analysis from results history
  - Opus/Sonnet strategy generation with reasoning
  - Feasibility check (min 5k eligible leads via SQL + semantic)
  - **Acceptance:** knowledge sources loaded, learnings analysis works, strategies generated, feasibility check correct, all TDD

- [x] #5 - Lead selection + inspection pipeline (S) — blocked by #1, #2
  - Anti-spam filtered lead selection (300 per variant)
  - Priority ordering (never-contacted first, oldest next)
  - Combined SQL + semantic search
  - Lead inspection: read summaries, identify patterns
  - **Acceptance:** anti-spam works, priority correct, inspection produces observations, all TDD

### Phase 4: Copy & Deploy (depends on #4, #5)
- [x] #6 - Copy generation pipeline - Haiku bulk (M) — blocked by #4, #5
  - Haiku generates personalized email per lead
  - Uses strategy + lead data + inspection context
  - Cost tracking (token usage)
  - Output format compatible with Email Bison
  - **Acceptance:** personalized copy generated, lead-specific data used, cost tracked, all TDD

- [x] #7 - Email Bison integration + campaign deployment (S) — blocked by #6
  - Email Bison API: create campaign, add leads + copies, schedule send
  - Campaign tracking: log strategy_name, lead_count, deploy_date, status=pending
  - Baseline campaign deployed alongside variants
  - **Acceptance:** campaigns created via API, scheduled correctly, 2 variants + 1 baseline, metadata logged, all TDD

### Phase 5: Evaluation (depends on #7)
- [x] #8 - Results evaluation + scoring system (M) — blocked by #7
  - Fetch results from Email Bison (48h+ old campaigns)
  - Scoring: positive_reply_rate primary, reply <1% penalty, bounce >=2% invalidate
  - Same-day baseline comparison
  - Results logging: keep/discard/invalid statuses
  - **Acceptance:** results fetched, scoring correct, baseline comparison works, statuses logged, all TDD

- [x] #9 - Baseline management + contact exhaustion handling (S) — blocked by #8
  - Baseline update: 30%+ improvement on 2 separate days -> new baseline
  - Contact exhaustion: < 300 eligible -> fall back to next best, pause not discard
  - Strategy ranking maintained
  - **Acceptance:** baseline updates correctly, exhaustion detected, fallback works, ranking maintained, all TDD

### Phase 6: Orchestration (depends on all above)
- [x] #10 - Daily cron orchestrator - full pipeline (M) — blocked by #1-#9
  - Full 11-step pipeline orchestration
  - 4:00 AM EST cron trigger
  - program.md with all rules/constraints
  - Error handling: log errors, skip to next step, idempotent
  - **Acceptance:** pipeline runs e2e, cron works, program.md created, errors handled, all TDD

### Phase 7: Dashboard (can start after #1, parallel with others)
- [x] #11 - Web dashboard: experiments, results, learnings (M) — blocked by #1
  - Next.js app
  - Active/pending experiments view
  - Past results with scores + status badges
  - Accumulated learnings view
  - Read-only (no write ops from UI)
  - **Acceptance:** shows experiments, results, learnings, prevents duplicate tests, responsive UI, component tests

### Phase 8: Bug Fixes (critical, must fix before QA)
- [x] #14 - BUG: Lead anti-spam fields never updated after deployment (S)
  - `deployCampaigns()` must UPDATE `last_campaign_date` and `campaign_count` on leads after deploy
  - Without this fix, anti-spam cooldowns don't work — same leads selected every day
  - **Acceptance:** leads updated after deploy, anti-spam correctly excludes recently contacted, all TDD

- [x] #15 - BUG: SQL injection risk in dynamic fields and computed enrichment (S)
  - `addDynamicField` must validate field names against `^[a-z_][a-z0-9_]*$` + reject reserved keywords
  - `runComputedEnrichment` must sanitize SQL expressions
  - **Acceptance:** injection attempts rejected, valid names still work, all TDD

- [x] #16 - BUG: No lead deduplication across campaign variants (S)
  - `selectLeads()` needs `excludeIds` parameter, pipeline passes used IDs between variant selections
  - **Acceptance:** no lead appears in multiple variants same day, all TDD

- [x] #17 - BUG: CSV parser doesn't handle quoted fields (S)
  - Replace naive comma-split with RFC 4180 compliant parsing (use a library or proper implementation)
  - **Acceptance:** commas in quoted values work, escaped quotes work, all TDD

## Rules
- **Skip issues with `[QA]` in the title** — those are for manual human testing only
- Work in dependency order: Phase 8 bugs can be done in any order (no dependencies between them)
