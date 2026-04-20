# Technical Debt / Hardening Backlog

## Priority 0 — do first

### Tooling
- [ ] Add real ESLint configuration compatible with current Next.js + ESLint versions
- [ ] Make `npm run lint` pass legitimately
- [ ] Add minimal test harness
- [ ] Add CI pipeline for build + lint + tests

### Cleanup
- [ ] Audit and remove or refactor dead/placeholder components:
  - `components/note/draft-editor.tsx`
  - `components/note/flags-panel.tsx`
  - `components/note/source-panel.tsx`
- [ ] Audit for other prototype leftovers that are no longer part of the main flow

### Documentation
- [ ] Keep README, POST_MVP_STATUS, and HANDOFF_ENGINEERING aligned as the codebase changes

---

## Priority 1 — architecture hygiene

### State/model cleanup
- [ ] Review `DraftSession` shape and split long-term persisted data vs transient UI state
- [ ] Review localStorage usage and define what should remain client-local vs server-persisted
- [ ] Normalize eval state boundaries and batch-runner state handling
- [ ] Reduce duplication between display metadata and persisted note session data

### API consistency
- [ ] Standardize API request validation across all route handlers
- [ ] Standardize error response shape
- [ ] Add better guardrails around malformed localStorage/persisted payloads

### File structure
- [ ] Review folder structure for long-term maintainability
- [ ] Decide whether to extract shared workflow utilities/components from current page-local logic

---

## Priority 2 — prototype infrastructure replacement

### Persistence
- [ ] Replace file-backed JSON prototype storage
- [ ] Define database model for drafts, provider settings, templates, eval artifacts
- [ ] Plan migration path from prototype store to real DB

### Auth / access
- [ ] Define auth model
- [ ] Define whether the app is single-user, multi-user, or org/team aware in beta
- [ ] Define draft ownership and settings ownership rules

### Environments
- [ ] Define staging vs production structure
- [ ] Clean up env handling and secret-management expectations
- [ ] Add error monitoring / observability plan

---

## Priority 3 — product hardening

### Template engine depth
- [ ] Convert current wedge-template framing into a more real template/profile data model
- [ ] Support stronger behavior differences between template types beyond labels

### Review experience
- [ ] Strengthen source attribution in review surfaces
- [ ] Improve explanation of why flags were triggered
- [ ] Improve empty states for no flags / no contradictions / no source segments

### Evaluation workspace
- [ ] Preserve eval tooling during refactor
- [ ] Improve batch-runner state reliability
- [ ] Consider reusable evaluation storage model instead of local-only state

### Example/demo quality
- [ ] Expand the de-identified example library
- [ ] Improve example realism and source structure quality

---

## Priority 4 — future-facing, not immediate
- [ ] Deeper specialty coverage outside psych-first wedge
- [ ] Richer copilot/reminder panel
- [ ] File/document ingestion
- [ ] Ambient listening/transcript ingestion beyond manual text input
- [ ] Team/org workflows
- [ ] Enterprise admin/governance features

---

## Rules for future work
- Do not treat prototype convenience as production architecture.
- Do not widen specialty scope faster than quality depth improves.
- Do not add real PHI workflows before auth, storage, logging, and security decisions are made.
- Protect the core product principle: flag gaps rather than invent details.
