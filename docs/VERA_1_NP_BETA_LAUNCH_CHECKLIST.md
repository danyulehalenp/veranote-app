# Vera 1-NP Beta Launch Checklist

## Purpose
- Run a tightly controlled first beta with one trusted NP tester before broader rollout.
- Confirm real-world usability, safety, and workflow fit in production.
- Capture failures quickly and convert them into regression coverage before expanding.

## Who Should Test First
- One trusted NP tester who is comfortable giving direct feedback.
- Prefer someone who will actually try messy real-world workflows, not just polished demo prompts.
- Prefer someone willing to stop and report anything that feels off, generic, unsafe, or clinically awkward.

## What The Tester May Use Vera For
- HPI generation
- Progress note cleanup
- Discharge summary draft support
- Risk and contradiction wording support
- MSE limitation checks
- Medication reference support
- Interaction concern triage
- Switching and cross-titration framework generation
- Medication documentation wording
- Iterative refinement from rough wording to final chart-ready wording

## What The Tester Must Not Use Vera For
- Autonomous note signing or submission
- Unsupervised medication orders
- Definitive cross-taper schedules
- Definitive diagnosis or treatment decisions
- Legal determinations
- Final capacity conclusions
- Drug-database replacement
- Raw PHI memory storage

## Suggested First Test Workflows
- HPI generation
- Progress note cleanup
- Discharge summary draft
- Risk contradiction wording
- MSE limitation check
- Medication reference
- Switching framework

## Required Safety Reminder
- Vera is documentation and reference support only.
- All output requires clinician review before use.
- Medication and switching answers require current prescribing or drug-reference verification.

## Feedback Questions
- Was this useful?
- Was anything clinically wrong?
- Was anything too generic?
- Did Vera miss key facts?
- Did Vera invent anything?
- Would you use this wording?

## How To Capture Failures
- Prompt
- Source summary
- Vera response
- What was wrong
- Desired behavior

## Expansion Rule
- Invite the remaining 4 testers only after 3-5 days without major safety or usability issues.
