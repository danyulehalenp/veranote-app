# Ambient Listening Module Scaffold

This prototype does **not** implement live ambient listening yet.

What is now present in the codebase:

- shared ambient-listening types:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/types/ambient-listening.ts](/Users/danielhale/.openclaw/workspace/app-prototype/types/ambient-listening.ts)
- default config/constants:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/lib/constants/ambient-listening.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/constants/ambient-listening.ts)
- config normalization helpers:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/lib/ambient-listening/config.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/ambient-listening/config.ts)

Why this exists:

- to give future ambient work a stable type/config/state foundation
- to preserve the research pack's architecture direction
- to keep ambient listening distinct from provider dictation

What is intentionally not present yet:

- microphone capture
- consent UI
- real provider sessions
- transcript persistence
- diarization correction UI
- evidence-anchor review UI
- ambient audit persistence
- retention jobs

Current product rule:

- ambient listening remains future work
- it is a separate lane from provider dictation
- it stays draft-only and consent-gated

When future implementation starts, the primary planning docs are:

- [/Users/danielhale/.openclaw/workspace/VERANOTE_AMBIENT_LISTENING_IMPLEMENTATION_SPEC.md](/Users/danielhale/.openclaw/workspace/VERANOTE_AMBIENT_LISTENING_IMPLEMENTATION_SPEC.md)
- [/Users/danielhale/.openclaw/workspace/VERANOTE_RESEARCH_IMPORTS_LOG.md](/Users/danielhale/.openclaw/workspace/VERANOTE_RESEARCH_IMPORTS_LOG.md)
- this scaffold doc
