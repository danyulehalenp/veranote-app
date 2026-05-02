# Dictation Desktop Overlay Architecture

## Goal

Build a Fluency-like desktop companion that can keep a speech box visible above other apps, capture dictation safely, and route reviewed text into Veranote or an EHR-focused field workflow.

## Why This Is Separate From The Web Module

The current Veranote dictation module lives inside the web app and is strong for:

- provider-controlled mic capture
- backend transcription sessions
- review-first insertion into Veranote source lanes
- provenance and audit history

It cannot, by itself, provide:

- a true always-on-top speech box over other desktop apps
- global dictation controls while focused in the EHR
- trusted insertion into the currently focused desktop field

Those features require a native desktop layer.

## Proposed System Shape

1. Desktop companion shell

- macOS-first native app or Electron shell
- always-on-top floating speech box
- global hotkey to start / pause / stop dictation
- secure local session state

2. Provider session bridge

- desktop shell talks to Veranote backend dictation sessions
- the backend stays the source of truth for provider selection, audit events, and transcript queueing
- the desktop shell displays active provider, engine, and fallback state

3. Command layer

- local stored commands and macros
- command expansion preview before insertion
- app-aware commands like `next field`, `insert plan template`, `send to subjective`

4. Targeting layer

- Veranote mode: send reviewed text back into source lanes
- EHR mode: target named destination fields one at a time
- paste / accessibility insertion / scripted field navigation depending on desktop permissions

## Overlay States

- `idle`
- `listening`
- `paused`
- `review_required`
- `command_detected`
- `inserting`
- `fallback_active`
- `error`

## Overlay Surfaces

1. Compact speech box

- microphone state
- active provider and engine
- live transcript preview
- command match indicator
- current insertion target

2. Review drawer

- final transcript segments awaiting insert
- review flags
- command expansions
- insert / discard / reroute actions

3. Target picker

- Veranote source lane
- EHR destination field
- desktop command target

## Security And Safety Rules

- no hidden background capture
- explicit recording indicator at all times
- no silent direct insertion into final note text
- no vendor keys in the renderer/browser layer
- keep review-first handling for risky clinical content
- preserve audit trail for provider, engine, target, and insert action

## Build Order

1. Finish the web dictation module provider controls and command foundation
2. Stand up the desktop speech-box shell with always-on-top behavior
3. Connect the shell to backend dictation sessions and live provider status
4. Add reviewed insertion into Veranote
5. Add EHR field targeting profiles
6. Add global commands and macros
7. Add desktop-grade audit, retries, and recovery

## Current Repo Foundations That Support This

- runtime provider selection
- backend dictation session bridge
- transcript queue and review-first insertion
- provider drift and operator reporting
- destination field metadata in `output-destinations.ts`
- command scaffold in `lib/dictation/command-library.ts`
- EHR insertion workflow profiles in `lib/dictation/ehr-insertion-profiles.ts`
