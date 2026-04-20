# Post-MVP Status Report

## Project
Veranote Prototype

## Identity note
The canonical product name is now **Veranote**. Some internal files and historical references may still use the older `Clinical Documentation Transformer` name until the rest of the workspace is normalized.

## Current state
This project has moved beyond an empty scaffold and is now a credible internal MVP / demo alpha for a clinician-facing documentation transformation product.

The current build supports a full prototype workflow:
- structured source intake
- note generation
- note rewriting
- contradiction / missing-data review
- saved drafts
- psych-first template framing
- fidelity evaluation and batch review
- results export

It is strong enough for internal walkthroughs, de-identified scenario testing, product review, and technical handoff preparation.

It is **not** production-ready and should not be treated as a real clinical platform yet.

---

## What is built

### Core note workflow
- Structured source intake with separate sections for:
  - clinician notes
  - intake / collateral
  - patient conversation / transcript text
  - objective data / labs / vitals / medications
- Specialty selection
- Note-type selection
- Template/profile selection
- Draft note generation
- Draft note rewrite actions:
  - more concise
  - more formal
  - closer to source
  - regenerate full note

### Review workflow
- Source vs draft comparison
- Missing / unclear item review
- Contradiction warning review
- Save draft
- Copy note
- Export plain-text draft
- Export review bundle

### Persistence
- Lightweight backend persistence via local file-backed JSON store
- Restore latest draft
- Saved drafts list
- Saved provider settings

### Template/profile layer
- Psych-first wedge framing in template/profile UI
- Wedge-specific profile language and guardrails
- Inpatient psych-focused template defaults and required sections

### Evaluation tooling
- Starter fidelity case set
- Eval page
- Batch runner
- Scorecards
- Output snapshot capture
- Mismatch hints
- Results history
- JSON export
- CSV export
- Reopen case from results

### Demo/testing support
- Example gallery
- Example loading into New Note workflow
- README updated to reflect current MVP scope and non-goals

---

## What is solid

### 1. Product direction
The product direction is coherent.
This is clearly a clinician-facing documentation transformation tool with source-faithful output and review-before-use guardrails.

### 2. End-to-end MVP flow
The internal workflow now hangs together:
- choose or load case
- enter source material
- generate note
- review contradictions / gaps
- save / export
- evaluate output quality

### 3. Safety posture for prototype stage
The prototype consistently reinforces the right principle:
- do not invent facts
- flag gaps instead of filling them in
- require clinician review before use

### 4. Evaluation environment
The eval system is a real strength.
Most prototypes stop at “the model kind of worked once.” This one now has a usable tuning loop and results workspace.

### 5. Prototype momentum
There is enough here now for:
- product conversations
- internal demos
- design iteration
- technical review by a future engineer
- sharper decisions about what should and should not be built next

---

## What is shaky

### 1. Tooling quality controls
- `npm run build` passes
- linting is **not configured yet**
- there is no automated test suite yet
- there is no CI pipeline yet

### 2. Persistence layer
- current storage is a file-backed JSON prototype store
- good enough for continuity demos
- not good enough for serious multi-user or production use

### 3. Template depth
- psych-first wedge framing is better now
- but template behavior is still mostly UI/profile framing, not a deeply configurable template engine yet

### 4. Contradiction engine depth
- current contradiction checks are useful but still heuristic/rule-based
- not deeply source-attributed
- not yet comprehensive across specialties/settings

### 5. Example/demo fidelity
- examples are useful for demo flow
- but still lightweight and not yet a strong curated library of realistic de-identified scenarios

### 6. Production readiness
Not ready for:
- PHI
- real clinician pilots
- hospital/group deployment
- ambient listening in production
- enterprise review

---

## Known gaps before a human engineer should feel good

### Engineering/tooling gaps
- add ESLint config and working lint pipeline
- add automated test coverage for core flows
- add CI checks
- clean up unused or placeholder components/files
- define architecture/documentation for data flow and state handling

### Product gaps
- stronger specialty behavior within the actual generation layer
- more realistic template/profile behavior
- richer example library
- improved failure-state testing
- stronger source attribution in review surfaces

### Infrastructure gaps
- move beyond file-backed storage
- define auth strategy
- define secrets/config strategy cleanly
- define staging vs production structure
- define observability/error tracking approach

---

## What a human engineer should tackle next

### First priority: hardening the base
1. Audit the codebase structure
2. Remove or refactor weak/unused scaffolding
3. Set up linting, tests, and CI
4. Normalize the data model and state boundaries
5. Decide what remains prototype-only vs what should be hardened

### Second priority: replace fragile prototype pieces
1. Replace the file-backed JSON persistence layer
2. Add real auth and access boundaries
3. Improve form validation and API validation consistency
4. Add better error-state handling

### Third priority: prepare for serious beta direction
1. Clarify the first true beachhead workflow
2. Deepen psych-first template behavior or another chosen wedge
3. Tighten review surfaces and source attribution
4. Build realistic de-identified scenario coverage

### Fourth priority: define the boundary before real data
Before any real PHI or pilots:
- security review
- storage review
- access-control review
- logging/audit decisions
- deployment architecture

---

## Recommended next-phase decisions

### Good next moves
- internal structured testing pass with de-identified scenarios
- handoff-ready engineering cleanup
- architecture notes and technical debt backlog
- wedge-specific depth rather than broad specialty sprawl

### Bad next moves
- ambient listening now
- hospital/governance features now
- pretending the prototype is production-safe
- broad multi-specialty expansion before one wedge is truly strong

---

## Bottom line
This project is now a strong internal MVP / demo alpha.

It is good enough to:
- demonstrate the product direction
- test workflows
- show to a potential technical lead
- support handoff planning

It is **not** yet good enough to:
- handle real clinical deployment
- process PHI in production
- serve as a stable beta platform without engineering hardening

The right next step is not “build everything.”
The right next step is to convert this from a good prototype into a handoff-ready foundation for a human engineer.
