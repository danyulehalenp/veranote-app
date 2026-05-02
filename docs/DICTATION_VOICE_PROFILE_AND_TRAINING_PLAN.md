# Dictation Voice Profile And Training Plan

Date: 2026-04-28

Status: design scaffold only. This does not add adaptive speaker modeling, PHI policy changes, or production voice-learning claims.

## Current Implemented Baseline

Veranote already has a provider voice-profile scaffold in `lib/dictation/voice-training.ts` and provider settings. The current system can:

- Show a voice-check prompt before dictation.
- Store a `baselineCompletedAt` marker when the provider marks the voice check complete.
- Store provider pronunciation hints and vocabulary boost terms through existing provider settings.
- Send vocabulary hints into backend dictation session creation.
- Surface rescue phrases when low-confidence or struggling recognition is detected.

## Near-Term Voice Check UX

The web Dictation Box should keep voice guidance visible near recording controls without blocking documentation. The immediate goal is not to train a model. The immediate goal is to help the provider speak a short, consistent phrase set and keep vocabulary hints close to the OpenAI transcription prompt.

Recommended starter phrases:

- Patient reports stable mood and denies medication side effects.
- Patient denies suicidal ideation, homicidal ideation, and hallucinations.
- Continue sertraline fifty milligrams daily and follow up in two weeks.

Recommended rescue behavior:

- If short junk transcripts appear, ask the provider to pause, speak one sentence at a time, and retry.
- If medication or diagnosis names misrecognize repeatedly, add them to pronunciation hints.
- If accuracy drops during a session, show the rescue phrases before adding correction grammar.

## Future Voice Profile Fields

Future provider voice profiles should track:

- Provider-specific vocabulary.
- Medication pronunciations.
- Common clinical phrases.
- Correction history.
- Accent and cadence notes.
- Specialty terms.
- Preferred dictation phrases.
- Repeated misrecognitions.

## Data And PHI Guardrails

Do not store raw audio unless a separate explicit retention policy is approved. Voice-profile data should stay provider-scoped and should not silently learn from PHI-heavy note content. Correction history should store minimal metadata and should avoid retaining more transcript text than needed for safe recognition improvement.

## MVP Boundary

Before beta, keep this as a hinting and onboarding system:

- Voice check complete marker.
- Vocabulary/pronunciation hints.
- Rescue phrases when recognition struggles.
- Manual provider-edited transcript before insertion.

Do not build full correction grammar, adaptive speaker embeddings, or automatic phrase learning until web dictation can reliably produce meaningful transcript candidates from human-spoken browser audio.
