---
name: prd-to-issues
description: Decompose a PRD into independently executable work items (GitHub issues). Creates vertical slices with blocking relationships for parallel agent work.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash(ls *)
  - Bash(git *)
  - Bash(gh *)
---

# PRD to Issues

Decompose Product Requirements Documents into independently executable work items.

## Workflow

1. **Locate** - Find and read the PRD (ask user if not obvious)
2. **Explore** - Understand the codebase context - what exists, what needs to change
3. **Slice vertically** - Create thin cross-layer tasks, NOT horizontal layers. Each issue should deliver a small but complete piece of functionality from top to bottom (UI → logic → data)
4. **Order** - Establish blocking relationships - which issues can run in parallel, which must be sequential
5. **Create** - Generate GitHub issues with:
   - Clear title
   - Description with context
   - Acceptance criteria
   - Blocked-by / blocks relationships
   - Estimated complexity (S/M/L)

## Rules

- Vertical slices > horizontal layers. "Add DB schema + API + UI for feature X" is ONE issue, not three
- Each issue should be independently testable
- Flag shared dependencies explicitly
- Keep issues small enough for a single agent session
- Include enough context that someone (or an agent) can pick up the issue cold
