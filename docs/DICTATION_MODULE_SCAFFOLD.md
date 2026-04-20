# Dictation Module Scaffold

This prototype does **not** implement live dictation yet.

What is now present in the codebase:

- shared dictation types:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/types/dictation.ts](/Users/danielhale/.openclaw/workspace/app-prototype/types/dictation.ts)
- default config/constants:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/lib/constants/dictation.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/constants/dictation.ts)
- config normalization helpers:
  - [/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/config.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/dictation/config.ts)

Why this exists:

- to give future dictation work a stable type/config/event foundation
- to preserve the research pack’s architecture direction
- to avoid starting voice work from scratch later

What is intentionally not present yet:

- microphone capture
- browser permission flow
- live STT provider sessions
- transcript insertion UI
- dictation audit persistence
- review-flag engine for transcript segments

Current product rule:

- dictation remains planned future work
- provider-controlled dictation is the first intended voice-input lane
- ambient/listening capture remains a separate later phase

When future implementation starts, the primary planning docs are:

- [/Users/danielhale/.openclaw/workspace/VERANOTE_DICTATION_IMPLEMENTATION_SPEC.md](/Users/danielhale/.openclaw/workspace/VERANOTE_DICTATION_IMPLEMENTATION_SPEC.md)
- this scaffold doc
