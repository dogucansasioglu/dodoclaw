---
name: write-a-prd
description: Convert conversations and ideas into structured Product Requirements Documents. Uses grill-me for deeper understanding, explores codebase, then generates a PRD with user stories.
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

# Write a PRD

Transform discussions into structured Product Requirements Documents.

## Workflow

1. **Collect** - Gather detailed descriptions from the user about what they want to build
2. **Verify** - Explore the codebase to verify assertions and understand current state
3. **Grill** - Apply the `/grill-me` approach to deepen understanding - ask clarifying questions until every branch of the design is resolved
4. **Sketch** - Identify major system modules and their interactions
5. **Write** - Generate a PRD with:
   - Overview and motivation
   - User stories (Agile format: "As a [role], I want [feature], so that [benefit]")
   - Technical requirements and constraints
   - Acceptance criteria
   - Out of scope items
6. **Submit** - Save as a file or create as a GitHub issue (ask user preference)

## Rules

- Do NOT skip the questioning phase - understanding > speed
- User stories describe desired behavior, not implementation
- Verify technical assumptions by reading actual code
- Keep the PRD concise but complete
- Flag any unresolved decisions clearly
