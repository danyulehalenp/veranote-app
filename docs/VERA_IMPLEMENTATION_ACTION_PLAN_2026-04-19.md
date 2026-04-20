# Vera Implementation Action Plan

## Goal
Turn Vera from a strong prototype assistant into a durable, provider-specific assistant that clinicians can trust over days and weeks without retraining.

## Critical Before Wider Beta

### 1. Provider account foundation
- Introduce a true provider account model instead of relying on only a prototype identity switcher.
- Separate:
  - provider account
  - provider identity/profile
  - provider settings
  - provider-scoped Vera memory
- Move from demo switching toward real auth/session support.

### 2. Server-side Vera memory ledger
- Replace browser-only memory as the source of truth.
- Split memory into explicit layers:
  - relationship memory
  - accepted preference memory
  - observed workflow memory
  - decision memory
  - safety memory
- Add provider-visible review/edit/reset controls for all durable memory.

### 3. Safety and context hardening
- Add clearer non-clinical-boundary enforcement in assistant response generation.
- Create a context assembly layer that summarizes only the most relevant compose/review context before the model responds.
- Prevent assistant prompt/context bloat from turning into hallucination risk.

### 4. Refactor monolithic Vera surfaces
- Split:
  - `components/veranote/assistant/assistant-panel.tsx`
  - `components/settings/provider-settings-panel.tsx`
  - `app/api/assistant/respond/route.ts`
- Move business logic into service modules and hooks.

## Next 2 Weeks

### 1. Finish provider account scaffolding
- Add provider account type and route.
- Tie current account to current provider identity/profile.
- Keep settings, presets, and Vera memory account-scoped.

### 2. Move presets fully into account scope
- Ensure saved presets are isolated per provider account.
- Add clearer ownership semantics in UI so it is obvious these belong to the signed-in provider.

### 3. Build first durable server memory layer
- Start with:
  - relationship settings
  - accepted preferences
  - last-used workflow patterns
- Keep local storage only as cache/fallback during transition.

### 4. Introduce a formal memory ledger UI
- Show:
  - observed
  - accepted
  - dismissed
  - used
  - last reinforced
  - why Vera inferred this
- Make this provider-account-aware.

### 5. Extract assistant response engine modules
- Break response route into modules such as:
  - workflow help
  - prompt builder
  - review help
  - provenance help
  - revision handling
  - safety/boundary handling

## Can Wait Until Later

### 1. Full conversation-history persistence
- Do not store endless raw threads by default.
- Prefer summarized and provider-approved memory over indiscriminate transcript storage.

### 2. Floating capture tray
- Strong future feature.
- Should come after provider accounts and server memory so captured workflow habits and intake behavior can be provider-specific.

### 3. More advanced personality shaping
- Continue developing Vera’s tone and rapport after the account and memory foundations are durable.

## Current Work Started

The following first-step work has already begun:
- provider identity switcher
- provider-scoped settings
- provider-scoped assistant learning
- provider-scoped cue usage
- provider-scoped Vera relationship settings
- provider-scoped presets
- early provider account scaffolding routes and types

## Recommended Immediate Execution Order

1. Finalize provider account scaffold
2. Add durable account-scoped memory persistence
3. Refactor assistant response engine
4. Add explicit memory-ledger data model
5. Prepare floating capture tray design after identity/memory foundation is stable

## Practical Product Principle

Vera should feel:
- like she knows the provider
- like she remembers their working style
- like she helps them anticipate issues
- like she reduces friction across the day

But that must come from:
- explicit provider identity
- durable memory
- transparent suggestions
- safe trust boundaries

Not from:
- hidden adaptation
- browser-only memory
- brittle UI heuristics
