# Veranote Product Inventory

Date: 2026-04-20

## Current read

Veranote is currently a usable psych-first beta prototype with a real provider workflow:

- beta sign-in
- one main workspace for compose/generate/review
- saved drafts
- integrated review and rewrite tools
- embedded Vera assistant
- structured beta feedback capture

Vera has received a disproportionate amount of recent product attention and is now more sophisticated than some surrounding app surfaces. The app itself is still coherent, but several product areas remain half-productized or clearly internal.

## Bucket 1: Already live and coherent

### Provider-facing product lane

- Main workspace on `/`
- New note workspace on `/dashboard/new-note`
- Saved drafts on `/dashboard/drafts`
- Dedicated review surface on `/dashboard/review`
- Beta sign-in flow on `/sign-in`

### Core app workflow

- Structured source intake
- Draft generation
- Rewrite actions
- Review flags and trust cues
- Saved draft reopening
- Provider-scoped auth/session behavior

### Vera workflow

- Assistant popup and composer
- Workflow-aware help modes
- Trusted reference lookup
- Coding/diagnosis/medication knowledge slices
- Emerging drug / NPS support
- Teach Vera this feedback capture

### Feedback loop

- In-app feedback inbox
- Vera-gap grouping and triage status
- Email notification to `daniel@veranote.org`

## Bucket 2: Prototype but needs productization

- File-backed prototype persistence in `.prototype-data`
- Templates/settings surfaces that still mix real controls with internal planning
- Provider preset/profile system that needs simplification
- Multiple overlapping review surfaces that could be clarified further
- Beta operations workflow that captures feedback well, but still needs stronger task/release discipline
- Vera reliability and consistency across the current wedge

## Bucket 3: Internal / roadmap only

- Eval and eval results
- Example gallery
- Agent Factory boundary references
- Ambient listening / dictation / voice planning
- Broad multi-specialty positioning beyond the current psych wedge
- Production compliance, EHR integration, admin governance, and deployment hardening

## Top 5 app priorities

1. Make the main workspace the unquestioned default.
2. Clean up provider-facing navigation.
3. Productize templates and provider settings.
4. Strengthen draft lifecycle management.
5. Tighten operational beta review and triage loops.

## Top 5 Vera priorities

1. Keep Vera grounded as an embedded workflow assistant, not a generic chatbot.
2. Improve reliability in the current high-value lanes before broadening further.
3. Deepen note-context-aware assistance.
4. Turn Teach Vera this into a stronger learning operations loop.
5. Continue improving trust signaling around certainty, references, and fallback behavior.

## Hide or defer immediately

- Eval surfaces
- Example gallery
- Agent Factory references
- Voice roadmap panels
- Overly broad settings/admin controls that do not belong in daily provider flow

## Concrete backlog

### Now

1. Simplify top-level provider navigation so Workspace and Saved Drafts are primary, while Review is clearly secondary.
2. Clarify the main-workspace-versus-full-review story in copy and layout.
3. Separate provider-facing template controls from internal roadmap/settings clutter.
4. Formalize a lightweight beta triage loop around feedback inbox statuses and taught/planned review cadence.

### Next

1. Tighten draft lifecycle states such as in-progress, ready for review, and finalized/exported.
2. Reduce provider exposure to internal-only surfaces even more aggressively.
3. Improve Vera’s workflow-aware guidance in the review stage and section-specific editing flow.
4. Build a clearer taught-items/release-notes rhythm from Vera gap feedback.

### Later

1. Replace prototype file persistence with a more durable application data layer.
2. Expand beyond the psych-first wedge only after provider workflow is tighter.
3. Revisit production-grade compliance/admin architecture and external integrations.

## Immediate execution choice

The best next app-level move is to keep simplifying the provider-facing shell so Veranote feels like one clear workflow again before adding more depth elsewhere.
