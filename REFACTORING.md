# Refactoring Plan — Caption-Studio

> Living document. Each agent picks a spec, implements it, runs lint + tests + build, then deletes the spec file.

## Status Legend

- `[]` — Not started
- `[x]` — Done (spec deleted)

## Active Specs

| # | Spec File | Category | Impact | Effort |
|---|-----------|----------|--------|--------|
| 1 | [refactor-remove-dead-code.md](refactor-remove-dead-code.md) | Dead Code | Low | 5 min | **[DONE]** |
| 2 | [refactor-consolidate-duplicates.md](refactor-consolidate-duplicates.md) | Duplicate Code | High | 30 min |
| 3 | [refactor-extract-caption-route.md](refactor-extract-caption-route.md) | Structure | High | 45 min |
| 4 | [refactor-split-usecaptionjob.md](refactor-split-usecaptionjob.md) | Structure | Medium | 45 min |
| 5 | [refactor-fix-naming.md](refactor-fix-naming.md) | Naming | Low | 15 min | **[DONE]** |
| 6 | [refactor-organize-types-file.md](refactor-organize-types-file.md) | Data Org | Low | 20 min |
| 7 | [refactor-remove-duplicate-keyboard-nav.md](refactor-remove-duplicate-keyboard-nav.md) | Duplicate Code | Medium | 20 min | **[DONE]** |
| 8 | [refactor-simplify-error-handling.md](refactor-simplify-error-handling.md) | Error Handling | Medium | 30 min |

## Completion Checklist

After implementing any spec:

1. `bun run lint` — no new warnings
2. `bun run test` — all tests pass
3. `bun run build` — builds cleanly
4. Delete the spec file from this directory
5. Update this table: cross off or remove the row

## Principles

- **Small PRs, small changes.** One spec = one logical change.
- **No behavior changes.** Refactoring should not alter user-visible behavior.
- **Tests first.** If a refactor touches logic that has tests, run them before and after.
- **When in doubt, ask.** If a spec is ambiguous, clarify before implementing.
