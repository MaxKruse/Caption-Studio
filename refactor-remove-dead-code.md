# Refactor: Remove Dead Code

## Rule
`micro-remove-dead-code` — Remove code that is no longer used.

## What to Remove

### `ensureOpenaiCompatible()` in `src/lib/image-utils.ts`

The function is marked `@deprecated` with the note "Use `prepareForApi` which also resizes oversized images."

**Steps:**
1. Search for all references to `ensureOpenaiCompatible` across the codebase (imports + calls).
2. If zero external references exist → delete the function and its JSDoc.
3. If references exist → update them to use `prepareForApi` first, then delete.

## Files Affected
- `src/lib/image-utils.ts`

## Acceptance Criteria
- `ensureOpenaiCompatible` no longer exists in the codebase.
- `bun run test` passes.
- `bun run build` succeeds.
