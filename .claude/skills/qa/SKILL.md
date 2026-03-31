---
name: qa
description: Generate a comprehensive QA plan from branch commits. Creates a GitHub issue with step-by-step manual testing guide covering every new feature, integration point, edge case, and potential bug.
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
  - Bash(cat *)
  - Bash(head *)
  - Bash(tail *)
  - Bash(wc *)
  - Agent
---

# QA Plan Generator

Generate a manual QA testing plan from the commits on the current branch.

## Workflow

1. **Gather changes** - Run `git log main..HEAD --oneline` and `git diff main...HEAD --stat` to understand what was built
2. **Deep read** - Read every new/changed source file (not tests) to understand:
   - Public APIs and their contracts
   - External dependencies (APIs, DBs, LLMs, file system)
   - Edge cases and failure modes
   - Integration points between modules
3. **Find bugs** - While reading, actively look for:
   - Missing error handling
   - Unvalidated inputs
   - State that's read but never written (or vice versa)
   - Race conditions
   - Security issues (injection, auth bypass)
   - Missing cleanup/teardown
   - Assumptions that could break
4. **Write QA plan** - Create a comprehensive testing guide organized by feature area:
   - Step-by-step instructions a human can follow
   - Prerequisites for each section
   - Expected results for each test
   - Edge cases and boundary tests
   - Integration/end-to-end smoke tests
5. **Report bugs** - If critical bugs are found during review, list them at the top of the QA plan with:
   - What's broken
   - Root cause
   - Where to fix
   - Severity (critical/high/medium/low)
6. **Create GitHub issue** - Save the QA plan as a GitHub issue with `[QA]` prefix and `QA` label so automated agents (ralph) skip it

## Rules

- **Read the actual code**, not just commit messages. Commit messages lie, code doesn't.
- Every feature in the diff must have at least one test step in the QA plan.
- Include setup/teardown instructions (e.g., "start ChromaDB", "import test data").
- Test steps should be concrete: "Insert a lead with campaign_count=2, last_campaign_date=today-29days" not "test the cooldown".
- Group by feature area, not by file.
- The QA plan is for humans -- write it clearly, no jargon.
- Always use `[QA]` prefix in issue title and `QA` label -- this signals to ralph/automated agents to skip it.
- If a `QA` label doesn't exist yet, create it.
- Cross-reference related implementation issues where relevant.
