# Engineering Handoff Notes

## Purpose
This document is for the human engineer or technical lead who picks up the Veranote prototype after the AI-assisted MVP phase.

Legacy naming note:
- older internal files may still refer to the product as `Clinical Documentation Transformer`
- the canonical product name is now **Veranote**

This project is a strong internal MVP / demo alpha. It is not production-safe yet.

---

## Current architecture at a glance

### Frontend
- Next.js App Router
- React client components for most interactive workflows
- Tailwind-based UI
- Main workflow pages:
  - `/dashboard/new-note`
  - `/dashboard/review`
  - `/dashboard/drafts`
  - `/dashboard/templates`
  - `/dashboard/examples`
  - `/dashboard/eval`
  - `/dashboard/eval-results`

### Backend/API
Prototype API routes:
- `POST /api/generate-note`
- `POST /api/rewrite-note`
- `GET/POST /api/drafts`
- `GET /api/drafts/latest`
- `GET/POST /api/settings/provider`

### Persistence
Current persistence is file-backed JSON in a prototype store via `lib/db/client.ts`.
This is good enough for local continuity and demos, but should be replaced before serious multi-user work.

### AI layer
Core AI logic lives in:
- `lib/ai/generate-note.ts`
- `lib/ai/rewrite-note.ts`
- `lib/ai/assemble-prompt.ts`
- `lib/ai/source-analysis.ts`
- `lib/ai/source-sections.ts`
- `prompts/`

### Evaluation layer
Eval/tuning workspace lives in:
- `lib/eval/`
- `components/eval/`
- `/dashboard/eval`
- `/dashboard/eval-results`

This is one of the most useful parts of the prototype and worth preserving.

---

## Recommended immediate engineering priorities

### 1. Clean up the codebase edges
There are still placeholder/prototype leftovers that should be removed or either reconnected properly.

Examples currently present:
- `components/note/draft-editor.tsx`
- `components/note/flags-panel.tsx`
- `components/note/source-panel.tsx`

These appear to be earlier scaffold components and are not the main live workflow anymore.
Decision needed:
- delete them if dead
- or reconnect them intentionally if they are meant to become shared building blocks

### 2. Restore basic engineering hygiene
Current status:
- build works
- linting is not actually configured yet
- no automated tests
- no CI

Immediate tasks:
- add ESLint config compatible with current Next/ESLint versions
- add at least a minimal lint script that truly runs
- add basic unit/integration test setup
- add CI pipeline for build + lint + tests

### 3. Normalize state/data boundaries
Current state is acceptable for prototype speed but should be normalized.

Specific concerns:
- some workflow state still relies on localStorage handoff patterns
- draft session shape is growing and should likely be normalized into clearer boundaries
- eval state, draft state, and template/profile state should be reviewed for overlap and long-term maintainability

### 4. Replace prototype persistence
`lib/db/client.ts` is a useful prototype seam but should not survive into serious beta unchanged.

Need to decide:
- Supabase/Postgres
- other hosted DB approach
- auth model
- per-user/per-org persistence rules
- migration path from current JSON store

---

## Product decisions already embedded in the prototype
These should be treated as intentional unless product direction changes.

### Safety principle
- do not invent facts
- prefer omission, uncertainty, or flags over unsupported detail
- clinician review before use is required

### Current wedge
- psych / behavioral-health documentation is the first tightened wedge
- broader multi-specialty ambition exists, but should not override wedge depth too early

### Input model
Structured source separation is already in place:
- clinician notes
- intake/collateral
- conversation/transcript text
- objective data

That architectural direction is worth keeping.

### Review model
The review layer now intentionally distinguishes between:
- contradictions
- missing/unclear items

That separation is useful and should likely deepen over time.

### Evaluation model
The fidelity evaluation workspace is a first-class asset, not a side project.
It should be preserved and improved rather than discarded during refactor.

---

## Recommended refactor path

### Phase A: foundation hardening
- remove dead scaffold components/files
- configure linting
- configure tests
- add CI
- review folder/module boundaries

### Phase B: persistence and auth direction
- replace file-backed JSON store
- define user model
- define auth boundary
- define org/team model if needed

### Phase C: workflow hardening
- improve API validation consistency
- improve failure handling and empty states
- improve source attribution and review surfaces
- improve template/profile data model

### Phase D: product depth
- deepen psych-first template behavior
- improve example library and realistic scenario coverage
- improve contradiction engine depth
- improve eval automation without over-trusting heuristics

---

## What not to do too early
- ambient listening in production
- enterprise governance/admin sprawl
- broad specialty expansion before wedge depth improves
- PHI-bearing pilots without infrastructure/security work
- treating prototype localStorage patterns as long-term architecture

---

## Current strengths worth protecting during refactor
- coherent end-to-end note workflow
- structured source intake
- review-before-use posture
- contradiction and missing-data separation
- eval/tuning workspace
- results export and batch flow
- psych-first wedge framing

---

## Bottom line for the incoming engineer
You are not inheriting a blank project.
You are inheriting:
- a coherent internal MVP
- a useful eval environment
- a strong product direction
- a prototype architecture that now needs adult supervision

The smartest first move is not feature expansion.
The smartest first move is engineering hygiene + architecture cleanup so future work compounds instead of rotting.
