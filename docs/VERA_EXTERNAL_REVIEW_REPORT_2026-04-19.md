# Vera External Review Report

## 1. Best Reading Of What Vera Is Becoming

Vera is envisioned as an embedded, **provider‑specific copilot** for Veranote’s psych‑first clinical documentation platform.  The architecture brief makes it clear that Vera is not a generic floating chat widget but a system designed to **remember individual provider preferences**, build a **long‑term relationship**, and support providers during both the **compose** and **review** stages【973707988879132†L0-L13】.  She aims to:

- Serve as a **personal assistant** who remembers how a provider likes to work, drafts prompts/presets accordingly, and guides them through complex workflows【973707988879132†L21-L33】.
- Operate in explicit modes (currently `workflow-help` and `prompt-builder`) and stages (`compose` and `review`), providing **structured actions** like replacing or appending preferences, drafting presets, jumping to evidence, or applying conservative rewrites【973707988879132†L40-L58】.
- Be **source‑first and trust‑constrained**, meaning she preserves provenance and uncertainty and refuses hidden edits【973707988879132†L184-L190】.
- Offer a **relationship‑memory layer** that persists the provider’s name, preferred address, interaction style and proactivity level so Vera can greet them appropriately and tune her tone【973707988879132†L121-L137】.

This direction aligns with research suggesting that AI assistants for healthcare should have narrow, clearly defined scopes【444854842288041†L188-L200】, explicit safety guardrails【444854842288041†L202-L208】 and adaptive personalization【759832580216039†L534-L536】.  Vera is trying to combine those attributes with a humanised voice and memory.

## 2. Biggest Strengths Already Present

1. **Clear product differentiation** – Vera is explicitly **provider‑specific**, remembers preferences, and is embedded in the existing compose→draft→review workflow【973707988879132†L0-L13】【973707988879132†L21-L33】.  This is distinct from generic AI widgets and addresses provider autonomy concerns【759832580216039†L498-L507】.

2. **Structured actions with user control** – The assistant defines a set of explicit actions (`replace-preferences`, `append-preferences`, `create-preset-draft`, `jump‑to‑source‑evidence`, etc.) and dispatches them through custom events【973707988879132†L49-L60】.  All edits are user‑triggered; the system avoids silent changes and emphasises transparency【973707988879132†L184-L190】.

3. **Rich context model** – The context passed to the assistant includes note type, specialty, provider profile, addressing name, interaction style, proactivity level, memory notes, output destination, selected preset, focused section, review warnings and counts【973707988879132†L62-L86】.  This allows Vera to give highly contextual suggestions and to respect destination constraints (e.g., EHR formatting).

4. **Emerging memory layers** – The system tracks **workflow patterns**, counts and statuses of suggestions, and persists relationship settings such as provider names and interaction style【973707988879132†L87-L111】【973707988879132†L121-L137】.  It surfaces memory through cues (workflow insights, memory modals, recent changes strips) and allows providers to accept, dismiss or act on suggestions.

5. **Prototype provider identity layer** – The app now has a provider identity list, an identity switcher in the top nav, provider‑scoped settings, learning storage and cue usage【973707988879132†L139-L147】.  This groundwork is essential for multi‑provider use.

6. **Thoughtful trust posture** – Vera explicitly preserves source fidelity and uncertainty, surfaces warnings rather than hiding them, and ensures providers remain the final decision‑makers【973707988879132†L184-L190】.  This aligns with safety literature recommending explicit guardrails and avoiding hallucinations【444854842288041†L202-L208】【760408726959885†L90-L104】.

## 3. Critical Flaws Or Gaps

1. **Fragmented memory persistence** – Provider settings and assistant learning are currently stored in **localStorage** via keys like `veranote:assistant-learning` and `clinical-documentation-transformer:provider-settings`.  This means preferences are tied to a single browser and are easily cleared or shared accidentally, undermining the promise of long‑term memory and multi‑device continuity.  A robust server‑side persistence layer is needed【973707988879132†L215-L232】.

2. **Incomplete authentication/identity model** – The “provider identity” implementation is a prototype; there is no real login, multi‑user auth, or organisation awareness【973707988879132†L139-L154】.  In its current form, any user can toggle identities via the identity switcher, which is not secure or compliant for production healthcare environments.  Without proper authentication, memory may bleed between users.

3. **Overly monolithic UI components** – Key files like `assistant-panel.tsx` (~836 lines), `provider-settings-panel.tsx` (~1410 lines), `new-note-form.tsx` (~2280 lines) and `review-workspace.tsx` (~3999 lines) have grown large【973707988879132†L170-L178】.  This concentration makes the assistant tightly coupled to large forms, increasing maintenance burden and making reuse/testing difficult.  Breaking logic into smaller components, hooks and services is critical.

4. **Mixing of UI and business logic** – The assistant’s decision logic (e.g., pattern inference, memory updates) resides partly in UI components instead of separate service modules.  For example, `assistant-panel.tsx` defines initial suggestions and calls functions from `assistant-learning.ts` directly rather than through a dedicated context builder.  This entanglement will hinder unit testing and could cause UI bugs to affect core logic.

5. **Limited assistant modes and discoverability** – The system currently exposes only `workflow-help` and `prompt-builder` modes【973707988879132†L40-L47】.  Yet the assistant performs review rewriting, cue surfacing and more.  Additional modes or contextual hints may be needed to make capabilities discoverable without overwhelming the provider.

6. **No clear separation between accepted and tentative memory** – The memory model has states (active, accepted, dismissed, used)【973707988879132†L95-L101】, but it isn’t obvious how tentative observations become durable preferences or how providers can audit them.  The risk is that unwanted behaviours get entrenched or that useful observations are lost.

7. **Lack of conversation or thread persistence** – Although `AssistantMessage` defines message IDs and roles, there’s no evidence of server‑side storage of chat history.  This may limit Vera’s ability to reference past interactions meaningfully and hampers cross‑session continuity.

8. **No API layer for memory operations** – The assistant uses browser events to send actions and localStorage to store memory.  There is no API endpoint to update, fetch or reset preferences.  Without this, integrating authentication and central storage will be challenging.

9. **Potential for automation bias** – The assistant surfaces repeated patterns and suggestions.  Without careful design, providers might over‑rely on Vera’s recommendations, as warned by physicians in co‑design studies【759832580216039†L589-L604】.  There needs to be emphasis on provider review and caution around default acceptance.

10. **Context overload risk** – The context passed to the assistant includes many fields (contradictions, counts, warnings, etc.)【973707988879132†L62-L86】.  If the assistant is given too much raw context or poorly summarised data, it may hallucinate or misinterpret information【760408726959885†L145-L172】.  A careful context assembly layer is needed to avoid prompt bloating.

## 4. Memory / Identity Risks

1. **Browser‑scoped memory** – Because preferences and learning are stored client‑side, clearing cache or switching browsers will erase memory.  Conversely, using a shared workstation risks leaking preferences between users.  Providers may not trust a system that forgets them or confuses them with someone else.

2. **No explicit privacy policy** – The architecture brief describes provider names and proactivity settings but does not discuss encryption, access controls or audit trails.  Voice or typed inputs may contain PHI; the absence of a documented compliance strategy exposes risk.  Voice AI guidelines emphasise encryption and explicit consent when processing voice data【283965394910959†L139-L152】.

3. **Unclear provider switcher semantics** – The identity switcher in the UI is prototypical; there is no session management.  Without proper authentication and separation, a provider may inadvertently access another’s memory or preferences.  An organisation‑aware account system with granular permissions is essential.

4. **Implicit learning vs explicit acceptance** – The current memory model allows “dismissed” or “accepted” suggestions, but the logic for promoting observations into durable memory is not transparent.  Providers must be able to view, edit and reset all learned patterns; otherwise, the system could subtly steer their documentation.

5. **No safety memory** – The open questions mention a need for safety memory【973707988879132†L215-L223】.  Without a dedicated layer to track high‑risk phrases or previous flags, the assistant may repeatedly suggest unsafe phrasing or fail to learn from past corrections.

## 5. Trust / Safety Risks

1. **Risk of hallucination from context errors** – If context includes contradictory or incomplete data, the underlying model may hallucinate.  Research indicates that truncated or misaligned context is a major source of AI hallucinations【760408726959885†L90-L104】.  There needs to be clear context hygiene and summarisation before calling the model.

2. **Inadequate guardrails on medical advice** – The current assistant actions avoid rewriting entire notes, but there is no explicit guardrail in the `respond` API against generating diagnostic impressions or treatment advice.  The Artera guidelines suggest including explicit “do not provide medical advice” rules in prompts【444854842288041†L202-L208】.

3. **Pattern suggestions could introduce bias** – If Vera surfaces behaviours that reflect a provider’s own unsafe habits (e.g., omitting risk assessments), she could reinforce these patterns.  Memory should separate **workflow preferences** (e.g., ordering of sections) from **safety procedures** (e.g., always include risk language) and never suggest omitting critical content.

4. **Over‑proactivity risk** – The architecture allows Vera’s proactivity level to be set to “anticipatory”.  Without limits, Vera might interrupt workflow with suggestions, increasing cognitive load or inadvertently altering note content.  Providers should explicitly opt into higher proactivity.

5. **Lack of training data transparency** – There is no mention of how the underlying models are fine‑tuned or whether they use PHI.  To build trust, providers need clarity on data handling, auditing and the possibility of vendor BAAs.

## 6. Product UX Risks

1. **Assistant discoverability vs overload** – Presenting too many suggestions or modes at once may overwhelm providers.  The initial suggestions list (e.g., “Help me shape this note lane” vs. “Add that UDS was +THC and +meth”) mixes high‑level and specific instructions.  It may be better to contextually surface only the top two or three suggestions relevant to the current action to avoid cognitive overload.

2. **Large, complex settings panel** – The provider settings panel is ~1410 lines long, suggesting a heavy UI.  Long forms can be daunting and increase friction in customisation.  Splitting settings into tabs (identity, memory, proactivity) and providing inline explanations may improve usability.

3. **Identity switcher confusion** – Without proper auth, switching identities via a UI drop‑down may feel strange.  It could also lead to accidental mis‑documentation if a provider forgets to switch back.  Clear sign‑in/out flows would anchor user expectations.

4. **No mobile/responsive strategy** – The brief does not mention how Vera behaves on mobile devices.  Considering many clinicians document on tablets or phones, a responsive assistant interface is necessary.

5. **Potential distraction in review** – During the review stage, clinicians need to focus on identifying errors and verifying content.  If Vera surfaces suggestions that are not pertinent to the current section, it may distract from trust tasks.  UI should limit the assistant’s presence or collapse it when not needed.

## 7. Architecture / Wiring Risks

1. **Event bus complexity** – The assistant uses custom browser events (`veranote-assistant-context` and `veranote-assistant-action`) to communicate between components【973707988879132†L62-L86】.  While this decouples some logic, it can become difficult to trace flows and debug issues, particularly as more events and listeners are added.  A central state management solution or context provider might simplify flows.

2. **Tight coupling to compose/review components** – The assistant context is published directly from `new-note-form.tsx` and `review-workspace.tsx` and reacts to event listeners within these components【973707988879132†L170-L178】.  This tight integration hinders reusability and testability.  Extracting assistant logic into hooks or external services would reduce coupling.

3. **Monolithic API route** – `app/api/assistant/respond/route.ts` is ~933 lines long【973707988879132†L170-L176】.  It contains heuristics for inferring note sections, generating rewrites and building responses.  Splitting this into separate functions or microservices (context assembly, intent classification, rewrite generation) would improve maintainability.

4. **Prototype database layer** – The `lib/db/client.ts` file suggests file‑backed persistence.  Without a real database, concurrency, scaling and multi‑user support will be problematic.  The assistant’s memory will need durable storage (e.g., PostgreSQL or Redis) with proper indexing and access controls.

5. **No test coverage shown** – The packet does not include tests.  For such a safety‑critical system, unit tests and integration tests are vital, especially around context assembly, memory updates and trust flag explanations.

## 8. Maintainability Risks

- **Growing file sizes** – Several files already exceed 800–4000 lines【973707988879132†L170-L178】.  As new features (additional modes, memory layers, provider auth) are added, these files will grow further, increasing the risk of bugs and making code reviews hard.

- **Implicit dependencies** – Business logic is scattered across components and libs.  For example, `assistant-panel.tsx` imports functions from `assistant-learning.ts` and `preference-draft` directly.  Without clear layering (e.g., services vs. UI), dependencies become tangled.

- **Lack of modular prompts** – The architecture uses static suggestion lists and in‑component heuristics.  Adopting a modular prompt template system as recommended for agentic AI【444854842288041†L220-L234】 would make prompt management easier and reduce risk of brittle prompts.

- **Rapidly evolving memory model** – The open questions highlight unresolved design of memory ledgers【973707988879132†L215-L223】.  Without a clear framework for how memories are stored, promoted and expired, maintainers will find it difficult to extend the system responsibly.

## 9. What Feels Distinctive And Valuable

- **Embedded, context‑rich assistant** – Vera is deeply integrated into Veranote’s workflow and surfaces context such as note type, source evidence and warnings.  This makes her feel like part of the product rather than a bolted‑on chat bubble.

- **Provider personalization** – Storing providers’ names, preferred addressing style and proactivity preferences enables a personal touch【973707988879132†L121-L137】.  Few documentation tools offer such relationship‑aware assistants.

- **Explicit trust posture** – The insistence on preserving uncertainty, exposing warnings and requiring explicit actions aligns with best practices for safe AI in healthcare【444854842288041†L202-L208】【760408726959885†L90-L104】.

- **Memory cues and insights** – Surfacing repeated workflow habits and offering to turn them into presets is a promising way to reduce friction.  If implemented transparently, this could meaningfully shorten documentation time and make providers feel understood.

- **Psych‑specific focus** – The system is built with psych evaluations and progress notes in mind.  That focus allows it to handle domain‑specific patterns (e.g., section names like HPI, MSE, UDS results) more intelligently than generic AI writers.

## 10. What Must Be Fixed Before Wider Beta Use

1. **Implement proper authentication & provider accounts** – Introduce secure login, session management and multi‑provider support.  Provider identities, preferences and memory must be stored server‑side, scoped to accounts and organisations.

2. **Establish persistent, secure memory storage** – Migrate from localStorage to a back‑end database with encrypted storage and audit logs.  Define a memory ledger that separates relationship memory, accepted preferences, workflow observations and safety signals【973707988879132†L215-L223】.

3. **Modularise codebase** – Refactor monolithic components and API routes into smaller, testable modules.  Move assistant logic into services or hooks, and adopt a state management library to reduce event‑bus complexity.

4. **Enhance trust and safety guardrails** – Add explicit prompt instructions forbidding medical advice【444854842288041†L202-L208】; ensure the model cannot generate diagnoses or treatment suggestions; create a safety memory layer that tracks flagged phrases and prevents repetition.

5. **Design context assembly and summarisation layer** – Implement a server‑side context builder that fetches only relevant data for the assistant and summarises it to avoid hallucinations【760408726959885†L145-L172】.

6. **Improve UX and discoverability** – Simplify settings panels, provide progressive disclosure of features, and ensure Vera’s suggestions do not overwhelm the provider.  Consider adding a help icon or onboarding tour explaining what Vera can do.

7. **Plan for scale and organisations** – Define data models (providers, organisations, notes, memories) and associated API routes.  Ensure that memory and preferences are separated by organisation to comply with privacy requirements.

8. **Implement analytics and feedback loops** – Track how often providers accept or dismiss suggestions, measure time saved, and collect qualitative feedback.  Use this data to tune proactivity levels and refine memory suggestions.

## 11. Recommended Next 5 Steps

1. **Define and implement a provider account system** with secure auth, session tokens, and organisation scoping.

2. **Build a server‑side memory service** that stores relationship settings, accepted preferences, dismissed suggestions and workflow observations.  Provide endpoints for fetching and updating memory; implement clear provider interfaces to view and reset memory.

3. **Refactor assistant context and action handling** into reusable hooks or services.  Replace the global event bus with a context provider or state machine that dispatches actions and updates state predictably.

4. **Create modular prompt templates and safety instructions**.  Separate universal guardrails (e.g., “do not give medical advice”) from use‑case specific instructions.  Use tools and functions rather than long prompts to reduce risk【444854842288041†L220-L234】.

5. **Conduct usability testing with clinicians**.  Observe how providers interact with Vera in both compose and review phases, gather feedback on cognitive load, trust, and memory suggestions, and iterate on UI/UX accordingly.

## 12. Clear Final Verdict

Vera shows strong promise as a personalised, agentic assistant embedded in the Veranote ecosystem.  Her design emphasises provider autonomy, source fidelity and trust, and incorporates emerging concepts like relationship memory and workflow insights.  These are meaningful differentiators that, if executed well, could significantly reduce documentation burden and improve note quality.

However, the current prototype has critical gaps in authentication, memory persistence, modularity and safety guardrails.  Large, monolithic components and reliance on localStorage expose maintainability and security risks.  Without server‑side accounts and storage, the promise of a personal assistant that “remembers you” will not hold up in real clinical use.  Moreover, the assistant must be carefully constrained to avoid automation bias and hallucinations and to respect providers’ workflow rather than dictate it.

**Verdict:** Vera is **on the right conceptual path**, but she is **not yet ready for wider beta use**.  Addressing authentication, persistence, modularity and safety will be essential before inviting more providers to rely on her.  With thoughtful refinements and rigorous testing, Vera could become a standout feature of Veranote’s psych‑first documentation platform.
