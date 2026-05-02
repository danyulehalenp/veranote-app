# Dictation Fluency-Style Validation Matrix

Last reviewed: 2026-04-26
Workspace: `/Users/danielhale/.openclaw/workspace/app-prototype`
Scope: current Veranote dictation lane, backend session bridge, STT adapters, command library, review-first insertion, audit/history, desktop overlay, macOS insertion helpers

## 1. Executive Summary

Veranote currently has a real **web dictation MVP candidate** and a real **desktop overlay alpha**, but it does **not** yet have full Fluency Direct or Dragon-style parity.

The strongest completed areas are:

- browser mic capture
- backend dictation session lifecycle
- chunk upload and chunk transcription
- review-first transcript queue
- accept/discard flow
- insertion into Veranote source lanes
- dictation provenance
- saved audit/history
- provider comparison and drift reporting
- always-on-top desktop overlay with global hotkey

The biggest Fluency/Dragon-style gaps are:

- no true low-latency streaming STT
- no spoken correction grammar
- no replace-last / undo-last text-editing command layer
- no offline/local STT option
- external app/EHR insertion is still best-effort and macOS-only
- field detection is heuristic, not native integration
- onboarding and permission guidance are still light

Bottom line:

- **Web dictation** is strong enough to call **internal MVP-testable**
- **Desktop overlay** is strong enough to call **internal alpha / constrained Phase 1.5 MVP-testable on macOS**, but not yet broad production-safe

## 2. Current Product Maturity

### Web dictation maturity

- Rating: **internal MVP-testable**
- Reason: the core workflow exists end to end in code:
  - start/stop recording
  - backend session creation
  - audio chunk upload
  - transcript event queue
  - accept/discard
  - source-lane insertion
  - provenance
  - audit/history

### Desktop overlay maturity

- Rating: **internal alpha, constrained Phase 1.5 MVP-testable**
- Reason: the overlay can:
  - stay always on top
  - open by global hotkey
  - start/stop a backend dictation session
  - capture mic audio
  - review transcript
  - accept/discard
  - commit into a linked Veranote draft
  - attempt desktop insertion into the active app
- Limitation: desktop insertion is still:
  - macOS-only
  - accessibility-dependent
  - heuristic for target detection
  - not validated against real EHRs as a production claim

### Practical Fluency/Dragon parity

- Simple dictation workflow parity: **moderate**
- Text-editing grammar parity: **low**
- Cross-app/EHR parity: **low to moderate, but unsafe to overclaim**

## 3. Web Dictation Matrix

| # | Feature | Status | Current behavior | Evidence | MVP-ready requirement |
|---|---|---|---|---|---|
| 1 | Push-to-talk / start-stop control | partial | Start, pause, and stop buttons exist, but no true hold-to-talk behavior. | [components/note/dictation/dictation-control-bar.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-control-bar.tsx), [components/note/new-note-form.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/new-note-form.tsx) | Add real push-to-talk semantics or explicitly scope MVP to start/pause/stop only. |
| 2 | Continuous dictation | partial | Recording continues while session is active, but as repeating recorder chunks, not continuous streaming STT. | [lib/dictation/browser-recorder.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/browser-recorder.ts), [components/note/new-note-form.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/new-note-form.tsx) | Prove longer dictation runs and stable chunk handling under normal session length. |
| 3 | Streaming transcription latency | partial | Session state can stream over SSE, but transcription itself is still chunk-based, so latency is near-live rather than true streaming. | [app/api/dictation/sessions/[sessionId]/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/dictation/sessions/[sessionId]/route.ts), [lib/dictation/server-stt-adapters.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/server-stt-adapters.ts) | Replace batch chunk transcription with provider-side streaming or document chunk-latency expectations clearly. |
| 4 | Chunk transcription | implemented | Browser uploads recorded chunks; backend transcribes OpenAI chunks or falls back. | [lib/dictation/browser-recorder.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/browser-recorder.ts), [lib/dictation/server-stt-adapters.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/server-stt-adapters.ts) | Validate chunk sizing, latency, and retry behavior under real usage. |
| 7 | Text preview before insertion | implemented | Interim text and pending final segments are shown before insertion. | [components/note/dictation/dictation-transcript-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-transcript-panel.tsx) | Already MVP-ready for web lane. |
| 8 | Accept/discard transcript queue | implemented | Final segments can be accepted or discarded explicitly. | [components/note/dictation/dictation-transcript-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-transcript-panel.tsx), [components/note/new-note-form.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/new-note-form.tsx) | Already MVP-ready for web lane. |
| 9 | Insert into Veranote source lanes | implemented | Accepted segments append into `clinicianNotes`, `intakeCollateral`, or `patientTranscript` through the editor adapter. | [lib/dictation/editor-adapter.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/editor-adapter.ts), [components/note/new-note-form.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/new-note-form.tsx) | Already MVP-ready for web lane. |
| 13 | Stored commands | implemented | Command library exists, commands are editable, and exact spoken matches can insert template output instead of raw text. | [lib/dictation/command-library.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/command-library.ts), [components/note/dictation/dictation-command-manager.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-command-manager.tsx) | Keep command scope simple for MVP. |
| 14 | Spoken punctuation | missing | No punctuation grammar or punctuation-token interpreter was found. | No punctuation-specific parser in [lib/dictation/command-library.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/command-library.ts) or [components/note/new-note-form.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/new-note-form.tsx) | Add explicit punctuation command parsing only after core STT stability. |
| 15 | Correction commands | missing | No speech-driven correction grammar like “correct that” or “select previous word” was found. | No correction-command layer in [lib/dictation/command-library.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/command-library.ts) or overlay handlers | Requires a true editing grammar and selection model. |
| 16 | Replace last sentence/phrase | missing | No replace-last-text command layer exists. | No replace-last handler in current dictation or overlay sources | Requires segment-aware text editing and source patch logic. |
| 17 | Undo last insertion | missing | No explicit undo-last-insertion workflow was found for dictation insertions. | No undo handler in [components/note/new-note-form.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/new-note-form.tsx) or [lib/dictation/editor-adapter.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/editor-adapter.ts) | Add reversible insertion transactions before calling this MVP-complete. |
| 20 | Provider vocabulary hints | implemented | Provider voice profile builds vocabulary hints and sends them into session creation and OpenAI prompt text. | [lib/dictation/voice-training.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/voice-training.ts), [app/api/dictation/sessions/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/dictation/sessions/route.ts), [lib/dictation/server-stt-adapters.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/server-stt-adapters.ts) | Already MVP-ready as a hinting system. |
| 21 | Clinical command expansion | partial | Safety, medication, and assessment template expansion exist, but not broad clinical grammar or smart editing commands. | [lib/dictation/command-library.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/command-library.ts) | Keep only narrow template commands in MVP. |
| 22 | Section-aware dictation | implemented | Dictation is explicitly targeted to supported source sections and insertion stays section-aware. | [types/dictation.ts](/Users/danielhale/.openclaw/workspace/app-prototype/types/dictation.ts), [components/note/new-note-form.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/new-note-form.tsx) | Already MVP-ready for source-lane use. |
| 23 | Audio privacy / no logging PHI | partial | Default config disables stored audio and stored interim transcripts, and the capability panel explicitly says no raw audio retention by default. | [lib/dictation/config.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/config.ts), [components/settings/dictation-capability-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/settings/dictation-capability-panel.tsx) | Validate transport/storage boundaries and document them clearly before production claims. |
| 24 | Audit trail | implemented | Session start, audio start, transcript events, insertions, errors, and stop are audit logged. | [lib/dictation/event-ledger.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/event-ledger.ts), [app/api/dictation/audit/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/dictation/audit/route.ts) | Already MVP-ready for internal audit visibility. |
| 25 | Dictation history | implemented | There is a dedicated history page with saved sessions and event detail. | [app/dashboard/dictation-history/page.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/app/dashboard/dictation-history/page.tsx), [components/note/dictation-history-dashboard.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation-history-dashboard.tsx) | Already MVP-ready for internal review. |
| 26 | Provider comparison/drift reporting | implemented | Session summaries, provider comparison, drift, and operator alerts exist. | [lib/dictation/history-provider-comparison.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/history-provider-comparison.ts), [components/note/dictation-history-dashboard.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation-history-dashboard.tsx) | Already strong for internal quality review. |
| 27 | Offline/local transcription option | missing | No local STT engine or offline transcription provider exists. | Provider list in [lib/dictation/server-stt-adapters.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/server-stt-adapters.ts) only exposes OpenAI and mock | Add a local provider before claiming offline support. |
| 28 | OpenAI transcription option | implemented | `openai-transcription` is available when `OPENAI_API_KEY` is configured. | [lib/dictation/server-stt-adapters.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/server-stt-adapters.ts) | Already MVP-ready conditionally. |
| 29 | Error recovery | partial | There is provider fallback, transport fallback to polling, capture error state, and session error logging. | [components/note/new-note-form.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/new-note-form.tsx), [lib/dictation/server-stt-adapters.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/server-stt-adapters.ts), [lib/dictation/server-session-store.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/server-session-store.ts) | Add clearer retry/resume UX and end-to-end failure drills. |
| 30 | User onboarding / permissions instructions | partial | Helper text, provider status notes, and voice-check guidance exist, but no dedicated first-run onboarding flow was found. | [components/note/dictation/dictation-control-bar.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-control-bar.tsx), [lib/dictation/voice-training.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/voice-training.ts) | Add first-run mic permission and troubleshooting guidance before broader testing. |

## 4. Desktop Overlay Matrix

| # | Feature | Status | Current behavior | Evidence | MVP-ready requirement |
|---|---|---|---|---|---|
| 1 | Push-to-talk / start-stop control | partial | Overlay supports start, pause, resume, and stop, but not hold-to-talk push-to-talk. | [desktop-overlay/renderer/overlay.js](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/renderer/overlay.js), [desktop-overlay/src/main.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/main.ts) | Keep explicit buttons for MVP or add real push-to-talk semantics. |
| 2 | Continuous dictation | partial | Overlay records repeated chunks while session is active. | [desktop-overlay/renderer/overlay.js](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/renderer/overlay.js) | Validate long-running overlay sessions under real use. |
| 3 | Streaming transcription latency | partial | Overlay gets near-live updates by repeated chunk upload plus session refresh/pull, not true streaming STT. | [desktop-overlay/src/bridge.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/bridge.ts), [desktop-overlay/renderer/overlay.js](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/renderer/overlay.js) | Same requirement as web: true provider streaming or clearly documented latency expectations. |
| 4 | Chunk transcription | implemented | Overlay audio chunks are uploaded to the same backend session API used by web dictation. | [desktop-overlay/renderer/overlay.js](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/renderer/overlay.js), [desktop-overlay/src/bridge.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/bridge.ts) | Already MVP-capable for internal overlay use. |
| 5 | Always-on-top overlay | implemented | Electron window is frameless and `alwaysOnTop`. | [desktop-overlay/src/main.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/main.ts), [desktop-overlay/package.json](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/package.json) | Already MVP-ready. |
| 6 | Global hotkey | implemented | `CommandOrControl+Shift+D` toggles the overlay. | [desktop-overlay/src/main.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/main.ts) | Already MVP-ready on supported desktop runtime. |
| 7 | Text preview before insertion | implemented | Overlay shows interim preview and pending final segments before insertion. | [desktop-overlay/renderer/overlay.js](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/renderer/overlay.js) | Already MVP-ready. |
| 8 | Accept/discard transcript queue | implemented | Overlay can accept segments into linked draft or discard them. | [desktop-overlay/src/main.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/main.ts), [desktop-overlay/renderer/overlay.js](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/renderer/overlay.js) | Already MVP-ready. |
| 9 | Insert into Veranote source lanes | implemented | Accepted overlay segments commit into a linked Veranote draft and append into target source sections. | [lib/dictation/overlay-draft-router.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/overlay-draft-router.ts), [app/api/dictation/sessions/[sessionId]/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/dictation/sessions/[sessionId]/route.ts) | Already MVP-ready. |
| 10 | Insert into external active app/EHR | partial | Overlay can attempt current-field insertion into the active app, but this is heuristic and not EHR-proven. | [desktop-overlay/src/main.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/main.ts), [desktop-overlay/src/macos-automation.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/macos-automation.ts) | Validate against real target apps and keep it explicit/operator-confirmed. |
| 11 | Clipboard/paste fallback | implemented | If direct insertion is unavailable, overlay falls back to clipboard priming and paste behavior. | [desktop-overlay/src/main.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/main.ts), [desktop-overlay/src/macos-automation.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/macos-automation.ts) | Already useful for internal MVP. |
| 12 | macOS accessibility insertion | partial | Overlay attempts direct focused-field value insertion on macOS when accessibility context is available. | [desktop-overlay/src/macos-automation.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/macos-automation.ts), [tests/dictation-macos-automation.test.ts](/Users/danielhale/.openclaw/workspace/app-prototype/tests/dictation-macos-automation.test.ts) | Requires app-by-app validation and permission guidance before production claims. |
| 13 | Stored commands | implemented | Overlay loads provider command library and can apply commands or navigate target field. | [desktop-overlay/src/bridge.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/bridge.ts), [desktop-overlay/renderer/overlay.js](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/renderer/overlay.js) | Already useful for MVP if kept simple. |
| 14 | Spoken punctuation | missing | No punctuation grammar was found in overlay command handling. | No punctuation parser in [desktop-overlay/renderer/overlay.js](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/renderer/overlay.js) or [lib/dictation/command-library.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/command-library.ts) | Do not include in MVP. |
| 15 | Correction commands | missing | No overlay speech-editing grammar like “scratch that” or “correct previous phrase.” | No correction handlers in [desktop-overlay/src/main.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/main.ts) | Requires text selection and edit model. |
| 16 | Replace last sentence/phrase | missing | Not present in overlay. | No replace-last command path found | Requires per-field edit history and text boundary handling. |
| 17 | Undo last insertion | missing | No explicit undo action exists for overlay-committed draft segments or active-app insertion. | No undo IPC or overlay action found | Add reversible transaction model before calling this usable. |
| 18 | Field targeting | implemented | Overlay cycles field targets, stores per-field buffers, and carries target metadata into insertions. | [desktop-overlay/src/main.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/main.ts), [lib/dictation/ehr-insertion-profiles.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/ehr-insertion-profiles.ts) | Already strong for internal MVP. |
| 19 | EHR target detection | partial | Overlay resolves best field target from workflow profile plus macOS context heuristics. | [desktop-overlay/src/target-adapters.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/target-adapters.ts) | Needs real-app validation and tuning. |
| 20 | Provider vocabulary hints | implemented | Overlay rides the same backend session creation path that supports vocabulary hints and voice profile data. | [desktop-overlay/src/bridge.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/bridge.ts), [app/api/dictation/sessions/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/dictation/sessions/route.ts) | Already inherited from web runtime. |
| 21 | Clinical command expansion | partial | Overlay can commit stored command output, but command set remains intentionally small. | [desktop-overlay/renderer/overlay.js](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/renderer/overlay.js), [lib/dictation/command-library.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/command-library.ts) | Keep scope narrow for MVP. |
| 22 | Section-aware dictation | implemented | Overlay commit path includes target section and destination-field metadata. | [lib/dictation/overlay-draft-router.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/overlay-draft-router.ts) | Already useful for MVP. |
| 23 | Audio privacy / no logging PHI | partial | Overlay uses backend bridge with same no-raw-audio-retention defaults, but desktop transport still needs operational validation. | [lib/veranote/desktop-bridge-auth.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/veranote/desktop-bridge-auth.ts), [components/settings/dictation-capability-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/settings/dictation-capability-panel.tsx) | Validate bridge auth, runtime storage, and desktop operational guidance. |
| 24 | Audit trail | implemented | Overlay segment commits create persisted audit events through the same dictation audit system. | [lib/dictation/overlay-draft-router.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/overlay-draft-router.ts), [lib/dictation/event-ledger.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/event-ledger.ts) | Already strong. |
| 25 | Dictation history | implemented | Overlay-produced sessions and insertions flow into the same dashboard history and audit system. | [app/dashboard/dictation-history/page.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/app/dashboard/dictation-history/page.tsx), [components/note/dictation-history-dashboard.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation-history-dashboard.tsx) | Already strong for internal use. |
| 26 | Provider comparison/drift reporting | implemented | Overlay sessions inherit the same reporting pipeline. | [lib/dictation/history-provider-comparison.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/history-provider-comparison.ts) | Already strong. |
| 27 | Offline/local transcription option | missing | Overlay uses the same backend provider list; no local STT. | [lib/dictation/server-stt-adapters.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/server-stt-adapters.ts) | Not MVP-critical. |
| 28 | OpenAI transcription option | implemented | Overlay backend sessions can request OpenAI transcription when configured. | [desktop-overlay/src/bridge.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/bridge.ts), [lib/dictation/server-stt-adapters.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/server-stt-adapters.ts) | Already available conditionally. |
| 29 | Error recovery | partial | Overlay supports provider status refresh, session stop, clipboard fallback, and macOS automation fallback, but recovery is still operationally thin. | [desktop-overlay/src/main.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/main.ts), [desktop-overlay/src/macos-automation.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/macos-automation.ts) | Add clearer operator messaging and retry flows. |
| 30 | User onboarding / permissions instructions | partial | There is no dedicated desktop onboarding wizard; permission state is mostly inferred from failures and status text. | [desktop-overlay/renderer/overlay.js](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/renderer/overlay.js), [desktop-overlay/src/validate-desktop-insertion.ts](/Users/danielhale/.openclaw/workspace/app-prototype/desktop-overlay/src/validate-desktop-insertion.ts) | Add explicit setup instructions for bridge key, mic permission, and accessibility permission. |

## 5. Fluency/Dragon Parity Gaps

These are the biggest parity gaps relative to a practical Fluency/Dragon-style product:

1. No true low-latency streaming STT session.
2. No spoken punctuation grammar.
3. No correction grammar like `correct that`, `scratch that`, `select previous word`.
4. No replace-last-phrase or undo-last-insertion model.
5. No offline/local transcription engine.
6. External app/EHR insertion is not app-certified or production-proven.
7. EHR target detection is heuristic.
8. Desktop onboarding and permissions setup are still thin.
9. No mature user-facing recovery loop for degraded transcription quality.
10. No production-grade cross-app editing semantics.

## 6. What Is Already Strong

1. Dictation is integrated into the real Veranote note workflow, not bolted on.
2. Review-first insertion is real and explicit.
3. Source-lane targeting is section-aware.
4. Provider vocabulary hints and voice-guide scaffolding already exist.
5. Stored command infrastructure is real and editable.
6. Audit trail and saved session history are stronger than many early dictation prototypes.
7. Provider comparison and drift reporting are unusually mature for this stage.
8. The overlay is a real Electron app with hotkey, target selection, and draft linking.
9. Clipboard and paste fallback make the desktop path useful even before full automation.
10. The codebase already separates web capture, backend session runtime, overlay bridge, and reporting cleanly.

## 7. What Is Unsafe/Unproven

1. Direct insertion into an external active app/EHR should not yet be presented as broadly reliable.
2. macOS accessibility insertion is implemented but still environment- and permission-dependent.
3. Real EHR-specific field detection has not been validated here as a production claim.
4. OpenAI chunk transcription is real, but latency and transcription quality under full provider workflows still need operational validation.
5. Audio privacy is designed conservatively, but production PHI assurances would still require operational review beyond code inspection.
6. Overlay README understates the actual implementation and should not be treated as the source of truth.
7. Voice training is a hinting/rescue system, not an adaptive speaker-recognition model.
8. Correction editing commands are absent, so users must rely on review-first acceptance rather than in-stream speech editing.

## 8. Minimal MVP Definition

### Phase 1 MVP: Web dictation in Veranote

Feasibility: **yes**

This MVP is already mostly present in code:

- web dictation in Veranote
- start/stop recording
- chunk transcription
- transcript review queue
- accept/discard
- insert into source section
- dictation provenance
- simple stored commands
- audit trail

To call Phase 1 MVP ready for internal testing:

1. confirm a clean end-to-end browser flow with configured OpenAI transcription
2. tighten onboarding/help text for mic permission and fallback behavior
3. define explicit success criteria for transcription latency and insertion accuracy

### Phase 1.5 Desktop MVP: Overlay

Feasibility: **yes, but internal-only and macOS-constrained**

This MVP is also mostly present:

- always-on-top overlay
- global hotkey
- start/stop backend session
- live/near-live preview
- accept/discard
- paste into active field
- copy fallback
- linked Veranote draft

To call Phase 1.5 desktop MVP ready for internal testing:

1. validate overlay behavior against at least one controlled text editor and one browser text field
2. document accessibility permission setup
3. define clear operator messaging when direct insertion fails and clipboard fallback is used

## 9. Recommended Next 5 Build Steps

1. Run a formal internal web dictation validation pass with OpenAI enabled and record latency, queue accuracy, and insertion accuracy.
2. Add explicit first-run onboarding for:
   - microphone permission
   - provider selection
   - fallback behavior
   - accessibility permission for desktop overlay
3. Add undo-last-insertion for web dictation and overlay-linked draft commits.
4. Add a minimal correction layer limited to safe operations such as:
   - discard last pending segment
   - reopen last inserted segment into review
5. Perform live app-by-app validation for desktop insertion against the highest-priority target destinations before expanding target packs further.

## 10. What Not To Build Yet

1. Full Dragon-style correction grammar.
2. Silent auto-insertion into EHR fields.
3. Auto-rewrite of dictated clinical meaning.
4. Offline/local STT unless there is a clear operational reason and support path.
5. Large advanced command suites before the current small command library is validated in real use.
6. Ambient/dictation workflow convergence in the same control shell.
7. Production claims about cross-app desktop insertion reliability before real app validation.
