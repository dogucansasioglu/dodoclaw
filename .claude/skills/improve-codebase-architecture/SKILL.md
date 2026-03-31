---
name: improve-codebase-architecture
description: Analyze codebase structure and suggest improvements for better AI agent navigability. Identifies scattered concepts, unnecessary extractions, tight coupling. Suggests deeper modules with clearer boundaries.
user-invocable: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash(ls *)
  - Bash(git *)
  - Bash(wc *)
---

# Improve Codebase Architecture

Analyze and improve codebase structure for better navigability (both human and AI agent).

## What to Look For

### Problematic Patterns
1. **Scattered concepts** - A single concept spread across many small files. If understanding feature X requires reading 8 files, the module is too shallow
2. **Extract-for-testing** - Pure functions extracted solely for testability rather than because they represent real concepts. This fragments understanding
3. **Tight coupling** - Modules that can't change independently. One change ripples across many files
4. **Premature abstraction** - Generic interfaces wrapping exactly one implementation
5. **Orphan utilities** - Helper files that exist "just in case" but serve one caller

### What Good Looks Like
- **Deep modules** - Simple interface, complex implementation hidden behind it
- **Colocation** - Related code lives together (feature folders > layer folders)
- **Clear boundaries** - You can explain what a module does in one sentence
- **Minimal coupling** - Modules interact through narrow, well-defined interfaces

## Workflow

1. **Survey** - Map the directory structure, identify major modules
2. **Measure** - File counts per directory, lines per file, import graphs
3. **Identify** - Find the problematic patterns listed above
4. **Present** - Show opportunities ranked by impact, with specific suggestions
5. **Discuss** - Let the user decide which improvements to pursue

## Rules

- Present findings, don't just start refactoring
- Rank by impact: what change would most improve understanding?
- Be specific: "merge utils/auth.ts into services/auth.ts" not "improve structure"
- Consider AI agent navigability: can an agent understand this module by reading 1-2 files?
- Weekly reviews or post-sprint cleanups are ideal timing
