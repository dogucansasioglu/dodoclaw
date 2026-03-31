---
name: tdd
description: Test-Driven Development enforcement. Red-green-refactor cycle. Write failing tests first, then implement, then refactor. Most consistent way to improve agent code quality.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# TDD - Test-Driven Development

Enforce red-green-refactor cycles for higher quality code.

## Workflow

1. **Confirm interfaces** - Understand what interfaces need to change or be created
2. **Identify behaviors** - List the behaviors that need tests (not implementation details, actual behaviors)
3. **Design testable interfaces** - If current code isn't testable, refactor to make it testable FIRST
4. **Red** - Write a failing test that describes the desired behavior
5. **Green** - Write the minimum code to make the test pass
6. **Refactor** - Clean up while keeping tests green
7. **Repeat** - Next behavior

## Rules

- NEVER write implementation before the test
- Tests describe behavior, not implementation details
- Each test should test ONE thing
- If you can't write a test, the interface needs redesign
- Run tests after each change to confirm red→green→green
- Refactoring = changing structure without changing behavior (tests stay green)
- Prefer integration tests over unit tests for agent work (mocks can hide real bugs)
