# Dictation Module Scaffold

This prototype now implements an **internal dictation MVP shell**.

What is now present in the codebase:

- shared dictation types:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/types/dictation.ts](/Users/danielhale/.openclaw/workspace/app-prototype/types/dictation.ts)
- default config/constants:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/lib/constants/dictation.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/constants/dictation.ts)
- config normalization helpers:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/config.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/config.ts)
- browser microphone permission + capture helpers:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/browser-mic.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/browser-mic.ts)
- local dictation session store:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/session-store.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/session-store.ts)
- transcript review flagging:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/review-flags.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/review-flags.ts)
- mock STT provider for internal testing:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/providers/mock-stt.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/providers/mock-stt.ts)
- backend-owned dictation session bridge:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/server-session-store.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/server-session-store.ts)
  - [/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/server-stt-adapters.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/server-stt-adapters.ts)
  - [/Users/danielhale/.openclaw/workspace/app-prototype/app/api/dictation/sessions/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/dictation/sessions/route.ts)
  - [/Users/danielhale/.openclaw/workspace/app-prototype/app/api/dictation/sessions/[sessionId]/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/dictation/sessions/[sessionId]/route.ts)
- browser recorder + chunk upload helpers:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/browser-recorder.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/browser-recorder.ts)
- provider-facing compose UI shell:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-control-bar.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-control-bar.tsx)
  - [/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-transcript-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/note/dictation/dictation-transcript-panel.tsx)

Why this exists:

- to give future dictation work a stable type/config/event foundation
- to preserve the research pack’s architecture direction
- to avoid starting voice work from scratch later

What is intentionally not present yet:

- live server-backed STT provider sessions
- PHI-safe vendor integration
- raw audio retention
- ambient listening / room capture
- direct final-note insertion
- audit-grade event persistence beyond draft provenance

Current product rule:

- dictation is now an internal MVP shell, not a production voice product
- provider-controlled dictation is the first intended voice-input lane
- ambient/listening capture remains a separate later phase
- accepted text still lands in source sections, not directly in the final note
- browser capture now talks to a backend-owned session bridge, uploads real audio chunks, and pulls queued transcript events from the backend, but the bridge still uses an internal mock provider rather than a real vendor

When future implementation starts, the primary planning docs are:

- [/Users/danielhale/.openclaw/workspace/VERANOTE_DICTATION_IMPLEMENTATION_SPEC.md](/Users/danielhale/.openclaw/workspace/VERANOTE_DICTATION_IMPLEMENTATION_SPEC.md)
- this scaffold doc
