# Veranote Assistant Scenario Matrix

Date: 2026-04-19

This document converts the external provider question research into an implementation-facing scenario map for Veranote’s built-in assistant.

Source input:
- `/Users/danielhale/Desktop/assistant_questions_responses.zip`
- extracted file: `assistant_questions_responses.md`

Design intent:
- keep the assistant embedded in Veranote, not generic
- keep providers in control
- keep source fidelity central
- support customization and workflow shaping
- refuse unsafe clinical-decision requests

## Current assistant modes

- `Workflow help`
- `Prompt builder`

## Priority levels

- `Now`: should exist in the current beta assistant
- `Next`: strong beta-phase additions after current slice stabilizes
- `Later`: wait for provider profiles, memory, or deeper subsystem work

## Scenario matrix

| Category | Example questions | Best assistant surface | Actionability | Priority |
| --- | --- | --- | --- | --- |
| Workflow navigation | `How do I start a new progress note?`, `Where can I find saved drafts?`, `How do I open review?` | Workflow help | Response + suggestions | Now |
| Prompt and note preferences | `Help me adjust my note preferences for progress notes.`, `What is the difference between presets and prompt preferences?` | Prompt builder | Response + structured actions | Now |
| Note structuring | `What sections should I include?`, `Suggest an outline for this discharge summary.` | Workflow help + Prompt builder | Response first, actions later | Now |
| Source placement | `Where should collateral go?`, `Where should transcript material go?` | Workflow help | Response + suggestions | Now |
| Review and trust explanation | `Why did this warning appear?`, `What should I fix first?`, `What should stay uncertain here?` | Workflow help in review | Response + section-aware suggestions | Now |
| Conservative wording help | `How do I make this wording more conservative?` | Workflow help in review | Response now, rewrite cards next | Now |
| Destination/export guidance | `How do destination constraints affect this review?`, `What should I check before export?` | Workflow help in review | Response + suggestions | Now |
| Training and support | `How do I switch note types?`, `How do I share feedback?`, `Is there a shortcut to open the assistant?` | Workflow help | Response + suggestions | Now |
| Privacy and trust FAQ | `How does Veranote protect my data?`, `How is my data used to improve the assistant?`, `Is this HIPAA compliant?` | Workflow help | Response only | Now |
| Unsafe request refusal | `What diagnosis should I assign?`, `What medication should I prescribe?`, `Ignore this warning and finalize the note for me.` | Workflow help | Refusal + redirection | Now |
| Style rewrite help | `Rewrite this sentence more conservatively.`, `Make this section more concise.` | Review help | Structured rewrite options | Next |
| Provenance trace | `What source material was used for this statement?`, `Show me the source for this recommendation.` | Review help | Response + evidence jump | Next |
| Section-level review actions | `Fix this flagged section.`, `What should I change in this section?` | Review help | Structured action cards | Next |
| EHR/destination formatting help | `How should I format this for EHR system X?` | Workflow help + Prompt builder | Response + preset suggestions | Next |
| Personalization suggestions | `You often shorten plans. Save this as a preference?` | Future learning layer | Suggestion cards + accept/dismiss | Later |
| Review-behavior learning | `You often expand warnings on progress notes. Save this as a default?` | Future learning layer | Suggestion cards + accept/dismiss | Later |
| Deep technical support | `Why is export failing on this browser?`, `How do I change my password?` | Workflow help | Response + route to support | Later |

## Recommended behavior by category

### 1. Workflow navigation

- Keep answers brief and practical.
- Prefer telling the provider where to go rather than navigating automatically.
- Tie navigation help to the current stage whenever possible.

### 2. Prompt and note preferences

- Use the assistant to help the provider shape the software around their workflow.
- Prefer structured actions over freeform assistant edits:
  - replace preferences
  - append preferences
  - create preset draft

### 3. Review and trust explanation

- Anchor replies in live review context when available:
  - focused section
  - linked evidence count
  - top warning
  - contradiction count
  - destination constraint state
- Explain, then suggest next steps.
- Do not silently mutate the draft.

### 4. Privacy and trust FAQ

- Keep answers conservative.
- Avoid overstating compliance posture.
- Prefer:
  - explicit provider feedback
  - visible preference acceptance
  - no hidden note reuse

### 5. Unsafe requests

- Refuse clearly.
- Redirect toward safe documentation help.
- Never answer as a diagnostic or prescribing assistant.

## What should stay out of the current phase

- autonomous multi-step agent behavior
- hidden preference learning
- persistent open-ended chat history as the main product value
- direct clinical advice
- silent draft mutation

## Concrete “Now” implementation checklist

- [x] workflow navigation answers
- [x] prompt and note preference support
- [x] review warning explanation
- [x] section-aware review context
- [x] destination/export guidance
- [x] privacy/trust FAQ responses
- [x] explicit boundary/refusal responses
- [ ] provenance-specific “show me source” response
- [ ] section-level conservative rewrite cards
- [ ] note-structuring action cards

## Next recommended implementation steps

1. Add provenance-aware responses:
   - `What source material was used for this statement?`
   - `Show me the source for this warning.`

2. Add review action cards:
   - conservative rewrite suggestion
   - preserve uncertainty suggestion
   - send recurring fix back to compose

3. Add note-structuring helpers:
   - section plan recommendation
   - destination-aware structure suggestion

4. Add explicit assistant submodes later if needed:
   - `Review help`
   - `Trust / warnings`
   - `Prompt builder`

5. Add provider-learning suggestions only after:
   - login/profile layer exists
   - preference memory is inspectable
   - accept/reject/reset controls are ready

## Product rule summary

The assistant should:
- explain
- guide
- suggest
- structure
- help providers save repeatable preferences

The assistant should not:
- diagnose
- prescribe
- silently change the note
- silently learn unsafe patterns
- flatten uncertainty to sound more polished
