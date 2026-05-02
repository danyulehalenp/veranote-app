# Veranote Dictation Module Current State Handoff - 2026-04-29

## Copy/Paste Summary

We are working in `/Users/danielhale/.openclaw/workspace/app-prototype` on the Veranote dictation module. The web dictation lane is now substantially better than the earlier failed state. The user confirmed it followed dictation correctly after the latest browser recorder changes. The remaining issue observed during human validation was punctuation cleanup: when the provider said "period," the transcript sometimes inserted a comma before the period, such as `word,.`. This was fixed by tightening the spoken-punctuation normalizer to remove comma/semicolon/colon immediately before terminal punctuation.

## Current Runtime Status

- Local app target: `http://localhost:3001/dashboard/new-note`.
- The app is currently running in a detached `screen` session named `veranote-dev`.
- The command used for stable local runtime is `npm run dev:test`, which maps to `next dev --port 3001`.
- A prior reliability problem came from Next repeatedly starting on `3000` while the browser was pointed at `3001`. That mismatch caused the site to appear broken.
- Current health check confirms `3001` is listening and the in-app browser loads Veranote with no browser console errors.

## Most Recent Fix

### User-observed problem

The provider dictated correctly, but when saying "period," some sentences were rendered with a comma before the period:

```text
doing well,.
sleeping better,.
denying suicidal thoughts,.
```

### Root cause

OpenAI/Whisper-style transcription can already infer punctuation around spoken punctuation words. When the STT result contains wording like `doing well, period`, Veranote's spoken-punctuation normalizer converted `period` to `.`, leaving the existing comma in place:

```text
doing well, period -> doing well,.
```

### Fix applied

Updated `normalizeSpokenDictationPunctuation` in:

```text
lib/dictation/transcript-segment-utils.ts
```

The normalizer now removes comma/semicolon/colon immediately before terminal punctuation:

```text
word,. -> word.
word;. -> word.
word:. -> word.
```

### Regression test added

Updated:

```text
tests/dictation-transcript-quality.test.ts
```

New covered case:

```text
Patient is doing well, period Sleeping better, period Denies suicidal thoughts, period
```

Expected normalized output:

```text
Patient is doing well. Sleeping better. Denies suicidal thoughts.
```

## Current Web Dictation Behavior

The current web dictation flow is intentionally batch/final-review based, not true live streaming:

```text
DICTATION lane -> Start -> speak full phrase -> Stop -> upload complete cumulative audio blob -> OpenAI transcription -> spoken punctuation normalization -> editable review box -> Insert into Live Visit Notes
```

Important UX point: the provider should not expect the final transcript while still recording. The intended flow is to speak the complete phrase, then click Stop to transcribe the full utterance.

## Improvements Already Completed In This Phase

- Dictation controls are reachable immediately after opening the DICTATION lane.
- The sticky in-page Dictation Box contains controls, mic status, transcript review, editable final transcript, and insert/discard actions.
- Dictation defaults to Live Visit Notes instead of Pre-Visit Data.
- Browser recorder no longer uploads raw headerless WebM slices as independent files.
- Browser recorder now builds cumulative standalone audio blobs.
- Web dictation no longer treats early partial uploads as final.
- Final transcription happens from the complete recorded utterance after Stop.
- Junk partial transcripts like `And...` are filtered.
- Spoken punctuation is normalized for period, comma, semicolon, colon, question mark, exclamation point/mark, parentheses, quotes, new line, and new paragraph.
- Duplicate punctuation such as `. .` or `..` is collapsed.
- Comma-before-period artifacts such as `,.` are now collapsed to `.`.
- Editable review is preserved before insertion.
- Inserted dictation still targets Live Visit Notes by default.
- The local dev server is pinned to port `3001` using `npm run dev:test`.

## Current Files Touched For Dictation

- `components/note/new-note-form.tsx`
  - Main web dictation UI and browser recorder flow.
  - Contains sticky Dictation Box, Start/Pause/Stop wiring, upload/finalization flow, transcript queue insertion, target defaulting to Live Visit Notes, and spoken punctuation normalization application.

- `lib/dictation/browser-recorder.ts`
  - Browser recorder helpers.
  - Handles MIME choice, cumulative audio blob building, audio skip reasons, and upload eligibility.

- `lib/dictation/transcript-segment-utils.ts`
  - Transcript quality filtering.
  - Spoken punctuation normalization.
  - Low-value transcript filtering.

- `tests/dictation-browser-recorder.test.ts`
  - Recorder helper coverage including cumulative blob and upload gating.

- `tests/dictation-transcript-quality.test.ts`
  - Quality filter and spoken-punctuation regression tests.

- `docs/DICTATION_VOICE_PROFILE_AND_TRAINING_PLAN.md`
  - Current design/scaffold for future provider voice profile and training.

## Validation Completed

Recent focused tests passed before this handoff:

```text
tests/dictation-browser-recorder.test.ts
tests/dictation-browser-mic.test.ts
tests/dictation-transcript-quality.test.ts
```

Earlier in this phase, broader focused dictation tests and `npm run build` passed after the batch-recorder and Dictation Box changes.

Current browser/server validation:

- `http://localhost:3001/dashboard/new-note` loads.
- Veranote title renders.
- New Note Workspace renders.
- Start Dictation is visible.
- Browser console errors: none observed.
- Dev server session: detached `screen` named `veranote-dev`.

## What Is Working Best Now

- Web dictation now captures the full spoken phrase much more reliably when the provider clicks Stop after speaking.
- The transcript is editable before insertion.
- The target lane defaults correctly to Live Visit Notes.
- The provider can dictate normal clinical content such as mood, medication tolerance, sleep, and suicidal ideation denial.
- The spoken punctuation layer is now usable enough for internal testing and has regression coverage for the latest punctuation artifact.

## Remaining Known Limitations

- This is still not true streaming transcription. It is batch transcription after Stop.
- Interim "live words" are not the main reliable path yet.
- Human mic validation is still needed after the comma-before-period fix.
- The punctuation normalizer is intentionally narrow. It is not a full Dragon/Fluency correction grammar.
- More clinical voice training/adaptive vocabulary is planned but not built.
- Web dictation should still be considered internal MVP-testable, not beta-ready, until several clean human validation passes are completed.

## Recommended Next Human Validation

Use Chrome/in-app browser at:

```text
http://localhost:3001/dashboard/new-note
```

Steps:

1. Click `Start Dictation` or open the DICTATION lane.
2. Confirm Dictation Box is visible.
3. Confirm target is Live Visit Notes.
4. Click Start.
5. Dictate this phrase:

```text
Patient reports they are doing well on current medication period They are sleeping better period They deny suicidal thoughts period
```

6. Click Stop.
7. Confirm the editable transcript appears.
8. Confirm output does not contain `,.`.
9. Correct text if needed.
10. Insert into Live Visit Notes.
11. Confirm inserted text appears in Live Visit Notes.

## Recommended Next Build Step

Run one more human validation pass specifically focused on:

- full phrase retention,
- punctuation after spoken `period`,
- comma/semicolon/colon before terminal punctuation,
- editable transcript behavior,
- insertion into Live Visit Notes,
- whether the dev server remains stable on `3001`.

If the punctuation looks clean, the next build step should be improving dictation reliability and clinician UX rather than adding full Fluency/Dragon command grammar. Recommended near-term improvement: add a small "dictation validation panel" that displays raw transcript, normalized transcript, and inserted transcript during internal testing only, so we can quickly see where errors originate.
