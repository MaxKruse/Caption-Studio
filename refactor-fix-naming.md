# Refactor: Fix Misleading Names

## Rule
`name-intention-revealing` — Use names that clearly communicate intent.

## What to Rename

### 1. `selectedModelState` → `selectedModel`

**File:** `src/components/hooks/useAppConfig.ts`

The state variable is named `selectedModelState` which implies it holds the "state of the model." It actually holds the **selected model ID string**. The `useState` pair should be `[selectedModel, setSelectedModel]`.

**Steps:**
1. Rename `selectedModelState` to `selectedModel` in `useAppConfig.ts`.
2. Rename `setSelectedModelState` to `setSelectedModel`.
3. Update the return object: `selectedModel` (was `selectedModelState`), `setSelectedModel` (was `setSelectedModel: useCallback(...) -> setSelectedModel`).
4. Update `CaptionStudio.tsx` where it reads `config.selectedModelState` → `config.selectedModel`.

### 2. `doFetch` → `fetchModels`

**File:** `src/components/hooks/useFetchModels.ts`

The internal fetch function is named `doFetch` which is non-descriptive. It should be `fetchModels` or `refreshModels`.

**Steps:**
1. Rename `doFetch` to `fetchModels` internally.
2. The returned key `fetchModels: doFetch` becomes `fetchModels` (no visible change to consumers).

## Files Affected
- `src/components/hooks/useAppConfig.ts`
- `src/components/hooks/useFetchModels.ts`
- `src/components/CaptionStudio.tsx` (update `config.selectedModelState` reference)

## Acceptance Criteria
- No behavior change.
- All TypeScript types resolve correctly.
- `bun run lint` passes.
- `bun run test` passes.
- `bun run build` succeeds.
