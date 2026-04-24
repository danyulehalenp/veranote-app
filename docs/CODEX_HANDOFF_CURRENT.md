# Codex Handoff — Current Veranote / Vera State

Last updated: 2026-04-21

## Read This First

Use this file at the start of any new Codex chat for this repo.

Suggested opener for a new chat:

`Please read /Users/danielhale/.openclaw/workspace/app-prototype/docs/CODEX_HANDOFF_CURRENT.md first, then continue from the current Veranote state.`

If running multiple Codex chats at once, each chat should claim one lane from the `Parallel work lanes` section below.

## Multi-Chat Operating Guide

Use this when you want Codex working in parallel on different parts of the app.

### Recommended setup

1. Open one Codex chat per lane.
2. Start each chat with the same handoff file.
3. In the first message, explicitly claim exactly one lane.
4. Tell each chat not to touch files owned by other active lanes.
5. Ask each chat to keep `npm run build` green before handoff.

### Best working rule

One chat = one lane = one main file cluster.

If a task starts spreading across unrelated files, split it into a separate chat instead of letting one chat drift into multiple lanes.

### Safe parallel pattern

- Lane A works only in main compose workspace files.
- Lane B works only in dedicated review files.
- Lane C works only in draft recovery files.
- Lane D works only in Vera assistant files.

Try to avoid having two chats edit the same file at the same time.

### Merge discipline

- Let each lane finish a small, coherent pass.
- Have that lane run `npm run build`.
- Review and merge one lane at a time.
- Refresh or restart the other chats if the merged work changes shared assumptions.

### When to start a fresh chat instead of continuing an old one

Start a fresh chat when:

- the task has changed lanes
- the product direction has shifted
- the old chat is carrying too much stale context
- you want stricter file ownership

### Minimal prompt template

`Read /Users/danielhale/.openclaw/workspace/app-prototype/docs/CODEX_HANDOFF_CURRENT.md first. Claim Lane X only. Do not edit files outside that lane unless absolutely necessary. Keep the current provider-first UX decisions intact. Run npm run build before handoff.`

### Four-chat starter set

Chat 1:

`Read /Users/danielhale/.openclaw/workspace/app-prototype/docs/CODEX_HANDOFF_CURRENT.md first. Claim Lane A only. Refine the main workspace aesthetics and setup/source flow. Do not edit dedicated review, drafts, or Vera files. Keep build-safe verification.`

Chat 2:

`Read /Users/danielhale/.openclaw/workspace/app-prototype/docs/CODEX_HANDOFF_CURRENT.md first. Claim Lane B only. Continue dedicated review simplification. Do not edit main workspace, drafts, or Vera files. Keep build-safe verification.`

Chat 3:

`Read /Users/danielhale/.openclaw/workspace/app-prototype/docs/CODEX_HANDOFF_CURRENT.md first. Claim Lane C only. Improve draft lifecycle and recovery behavior. Do not edit main workspace, dedicated review, or Vera files. Keep build-safe verification.`

Chat 4:

`Read /Users/danielhale/.openclaw/workspace/app-prototype/docs/CODEX_HANDOFF_CURRENT.md first. Claim Lane D only. Improve Vera workflow fit without changing the main workspace layout. Do not edit main workspace, dedicated review, or drafts files. Keep build-safe verification.`

### Optional coordinator chat

If you want one extra chat just for integration, give it this role:

- no feature work
- no proactive UI redesign
- only reconcile merged lane changes
- update this handoff file when priorities or file ownership shift

Suggested coordinator opener:

`Read /Users/danielhale/.openclaw/workspace/app-prototype/docs/CODEX_HANDOFF_CURRENT.md first. Act only as integration coordinator. Do not take a product lane. Help reconcile finished lane work, identify overlap risk, and update the handoff when lane boundaries or priorities change.`

### Quick collision check

Before starting a new chat, sanity-check:

- Is another active chat already editing this file?
- Does this task really fit one lane?
- Will this change alter shared layout or navigation assumptions?
- Should the handoff file be updated first so all chats inherit the same rules?

## Where The Product Stands

Recent work has shifted Veranote back toward a provider-first note workflow instead of a long prototype page.

Current shape:
- main workspace is now a one-screen compose/review workspace instead of a tall stacked page
- compact setup area sits at the top
- source-entry work area and generated-note review area are visible together
- internal/provider shell cleanup has already been done
- Vera has had major recent work, but the current product priority is the provider workflow and note review experience

## Most Important Current UX Decisions

These are intentional and should not be casually reverted:

1. Provider work fields come first.
- Training/explanatory material should stay out of the main work path.
- Guidance belongs in collapsed `Reference` / `Help` areas unless absolutely necessary.

2. The provider should work mostly on one screen.
- Avoid long vertical pages where possible.
- Prefer fixed work areas with internal scrolling over endless document scroll.

3. Setup is secondary to actual note work.
- Setup should be compact.
- The primary visible work should be source entry, generation, review, and copy/export.

4. Generated note review should stay close to source entry.
- The provider should not have to hunt for the note after generating it.

5. Dedicated review is a secondary deep-review surface.
- The true review/edit work belongs at the top.
- The heavier support layers belong below in a collapsible reference section.

## Current Problem Areas

These still need refinement:

### 1. Main workspace density
- Better than before, but still needs aesthetic and flow cleanup.
- Setup can likely be compressed further.
- The source-entry flow may still need clearer step framing and stronger visual hierarchy.

### 2. Dedicated review page
- Recently improved, but still too dense.
- Needs another simplification pass:
  - cleaner top review/editor area
  - lighter finish/copy path
  - less visual noise inside the lower reference drawer

### 3. Overall use of space
- User strongly prefers using the page width efficiently.
- Dead margins and decorative top chrome are viewed as waste.

## Files Most Central Right Now

Primary workspace:
- `/Users/danielhale/.openclaw/workspace/app-prototype/app/page.tsx`
- `/Users/danielhale/.openclaw/workspace/app-prototype/components/layout/app-shell.tsx`
- `/Users/danielhale/.openclaw/workspace/app-prototype/components/layout/top-nav.tsx`
- `/Users/danielhale/.openclaw/workspace/app-prototype/components/note/new-note-form.tsx`
- `/Users/danielhale/.openclaw/workspace/app-prototype/components/veranote/input/SourceInput.tsx`

Dedicated review:
- `/Users/danielhale/.openclaw/workspace/app-prototype/app/dashboard/review/page.tsx`
- `/Users/danielhale/.openclaw/workspace/app-prototype/components/note/review-workspace.tsx`

Draft recovery:
- `/Users/danielhale/.openclaw/workspace/app-prototype/components/note/saved-drafts-list.tsx`
- `/Users/danielhale/.openclaw/workspace/app-prototype/app/dashboard/drafts/page.tsx`

Vera:
- `/Users/danielhale/.openclaw/workspace/app-prototype/components/veranote/assistant/assistant-shell.tsx`
- `/Users/danielhale/.openclaw/workspace/app-prototype/components/veranote/assistant/assistant-panel.tsx`
- `/Users/danielhale/.openclaw/workspace/app-prototype/components/veranote/assistant/thread-view.tsx`

Product inventory:
- `/Users/danielhale/.openclaw/workspace/app-prototype/docs/VERANOTE-APP-AND-VERA-INVENTORY-2026-04-20.md`

## Very Recent Changes

### Workspace
- moved toward a one-page provider workflow
- compact setup row at top
- source area and review area visible together
- nonessential guidance moved out of the main path into reference/help sections
- internal scrolling restored inside workspace panes

### Dedicated review
- actual draft editor and finish/export actions were moved to the top
- heavier support systems were pushed into a lower `Reference and deep review` drawer
- extra top review-page intro chrome was reduced

### Shell cleanup already done
- internal tools were consolidated
- provider shell was simplified
- templates/settings were cleaned up

## Current User Preferences

The user has been very clear about these preferences:

- simplify aggressively
- avoid wasted screen space
- avoid giant banners/hero areas
- avoid long explanatory copy in primary work zones
- keep only essential work fields in the main provider flow
- make the UI feel high-tech and sophisticated, not generic or cluttered
- when something is optional, put it behind a collapsed reference/help surface

Communication preference:
- short, direct, action-oriented updates
- do not over-explain
- do not repeat the same rationale

## Testing Status

Most recent reliable check:
- `npm run build` passed after the latest dedicated review restructuring

Useful commands:

```bash
cd /Users/danielhale/.openclaw/workspace/app-prototype
npm run build
```

Known broader repo caveat from earlier work:
- `npm run lint` had older unrelated failures outside the recent UI pass
- `npm test` had some older unrelated failures outside the current workspace/review UI work

So for fast safety on this active UI lane, `npm run build` has been the main verification gate.

## Best Next Steps

### Next best single-thread move
- continue simplifying the dedicated review surface
- keep the real review/edit/export path visually dominant
- further reduce the density of the lower reference drawer

### After that
- tighten the main workspace aesthetics and spacing
- make setup even lighter
- make source entry feel more obvious and more elegant

## Parallel Work Lanes

If using multiple Codex chats at once, use these lanes to reduce overlap.

### Lane A — Main workspace refinement
Focus:
- `/components/note/new-note-form.tsx`
- `/components/veranote/input/SourceInput.tsx`
- `/app/page.tsx`

Goal:
- make setup smaller
- strengthen source-entry hierarchy
- improve aesthetics and spacing

### Lane B — Dedicated review simplification
Focus:
- `/components/note/review-workspace.tsx`
- `/app/dashboard/review/page.tsx`

Goal:
- simplify top review area
- reduce density in the lower reference drawer
- make finish/copy path clearer

### Lane C — Draft lifecycle and recovery
Focus:
- `/components/note/saved-drafts-list.tsx`
- `/app/dashboard/drafts/page.tsx`

Goal:
- better resume behavior
- clearer status handling
- keep reopening anchored to the main provider workflow

### Lane D — Vera workflow fit
Focus:
- `/components/veranote/assistant/assistant-panel.tsx`
- `/components/veranote/assistant/assistant-shell.tsx`
- `/components/veranote/assistant/thread-view.tsx`

Goal:
- keep Vera supportive, not competing with the note workspace
- improve contextual prompts and stage-aware help

## Guardrails For Future Codex Chats

- Do not reintroduce large homepage banners above the real workspace.
- Do not put guidance boxes above core work fields unless the user explicitly asks for training-mode help.
- Do not turn dedicated review back into a giant stack of equal-weight panels above the note editor.
- Do not assume the user wants more features before simplifying the provider path.

## Resume Prompt Examples

Example 1:

`Read /Users/danielhale/.openclaw/workspace/app-prototype/docs/CODEX_HANDOFF_CURRENT.md and continue dedicated review simplification. Keep build-safe verification.`

Example 2:

`Read /Users/danielhale/.openclaw/workspace/app-prototype/docs/CODEX_HANDOFF_CURRENT.md and take Lane A only: refine the main workspace aesthetics and setup/source flow.`

Example 3:

`Read /Users/danielhale/.openclaw/workspace/app-prototype/docs/CODEX_HANDOFF_CURRENT.md and continue Vera workflow-fit improvements without changing the main workspace layout.`
