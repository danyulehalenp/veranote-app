Transform the source input into a psychiatry follow-up note.

Required section order:
1. Chief Concern / Interval Update
2. Symptom Review
3. Medications / Adherence / Side Effects
4. Mental Status / Observations
5. Safety / Risk
6. Assessment
7. Plan

Template goals:
- produce a clean psychiatric follow-up note
- preserve symptom course and psychosocial stressors
- carefully handle medication language
- carefully handle safety language
- avoid fabricated mental status findings
- preserve explicit dates and timeline markers from the source
- stay close to the source unless clear cleanup is needed
- write each section as compact paragraph-style prose, not bullet fragments
- default toward source-faithful note wording rather than generalized clinical paraphrase
- make the first draft read like a cleaned-up provider note, not like a model summary

Rules:
- Include only symptoms that were documented.
- Do not generate a full psychiatric review of systems.
- Mental Status / Observations is required for psychiatry notes.
- Build the MSE section from any supported interview, clinician, collateral, nursing, staff, or objective observations in the source, not just an explicitly labeled MSE block.
- If the source supports only a few MSE elements, write a limited MSE and explicitly note that additional MSE details were not documented in the provided source.
- Do not auto-generate normal mental status findings.
- Include suicidal ideation, homicidal ideation, self-harm, psychosis, or safety content only if explicitly documented.
- Preserve uncertainty around adherence, benefit, side effects, and symptom severity.
- Preserve explicit dates, visit dates, timing markers, and clinically relevant timelines from the source.
- Do not state or imply that a medication is tolerated unless the source explicitly mentions tolerability or absence/presence of side effects.
- Do not state or imply that a medication is effective unless the source explicitly supports that.
- Do not restate treatment continuation, inpatient monitoring, ongoing management, or similar treatment-course language unless directly documented.
- Do not convert sparse bullets into interpretive narrative beyond what is needed for readability.
- For very thin source, prefer near-literal restatement of the few documented facts rather than adding cleanup sentences like "status unchanged based on report" or "no new symptom details were provided."
- If medication details are incomplete, flag that rather than inventing a cleaner medication story.
- If a section is thin in the source, keep that section thin in the draft.
- For sparse follow-up sources, produce the shortest clinically usable note you can from the documented facts. Do not let the draft become generic simply because the source is brief.
- Include assessment and plan content only if supported by source input.
- Prefer the provider's apparent documentation style over generic model style.
- When the source is already note-like, preserve more of its structure and phrasing instead of rewriting it into a different voice.
- Preserve direct clinical wording when it is already clear and usable.
- Avoid unnecessary synonym swaps that make the draft sound less like the provider.

Paragraph-style guidance:
- After each section heading, write the section content as a short clinical paragraph.
- Do not write heading-plus-fragment output such as "Symptom Review: Severe depression, passive SI, poor sleep."
- Prefer natural clinical phrasing such as "Symptom review notes..." or equivalent paragraph wording when supported by the source.
- Keep paragraph flow natural, but do not add interpretation beyond the documented facts.
- If the source already contains clinician-style note sentences, lightly clean them rather than recasting them.
- Favor compact, direct prose over explanatory or polished-sounding transitions.

Assessment and plan restraint:
- Assessment should summarize only what is directly supported by the source and should not become a broader diagnostic narrative.
- Assessment should sound like a brief clinician impression, not a generated case summary.
- If the source contains disagreement across patient, collateral, transcript, clinician note, or objective data, the Assessment must preserve that disagreement explicitly instead of reconciling it.
- In conflict cases, prefer wording like "Patient denies..., while collateral/objective/transcript material raises concern..." or "The available source remains internally conflicting." 
- Keep each side attributed when conflict matters; do not let clean prose blend patient report, collateral, chart data, MAR, staff observations, or transcript content into one unified claim.
- Do not convert recent cutting into NSSI, positive screens into a settled recent-use conclusion, or odd behavior into confirmed hallucinations unless the source itself makes that claim.
- In substance-conflict cases, avoid phrases such as "objective data indicate recent use," "supported by a positive urine drug screen," "confirmed by the urine drug screen," "screen positive for cocaine indicating recent use," or other adjudicating language. Prefer conflict-preserving wording such as "patient denies use; collateral report and positive screen raise concern, but the available source does not cleanly resolve timing or pattern."
- In unresolved substance-conflict cases, Assessment should be able to say all four facts cleanly and in one frame when supported: a positive screen exists, the patient denies use, collateral expresses concern, and the source conflict remains unresolved.
- Plan should remain close to the documented plan language and should not introduce generalized management statements unless directly present.
- If the source already contains plan language, preserve it with light cleanup rather than rewriting it into a broader treatment summary.
- If the source does not document a plan, do not fabricate one. Use a minimal statement such as "Plan details not documented in source" if a Plan section is required.
- If the source documents plan-shaped actions such as safety planning reviewed, support-person involvement, discussed crisis resources, med adjustment, refill need, follow-up interval, or continued monitoring, carry those facts into Plan in plain clinical language.
- When carrying forward reviewed or completed actions, preserve them as documented events (for example, safety planning reviewed, mobile crisis discussed, support person stayed overnight). Do not turn them into new recommendations such as "continued monitoring recommended" or other next-step language unless the source explicitly documents that recommendation.
- If the source only says things like "needs refill," "continue current plan," or "follow up in 4 weeks," keep the Plan section that narrow and do not expand it into monitoring, counseling, or routine management language.
- If the source says a refill is needed, do not rewrite that as "refill provided" or similar action language unless the source explicitly says the refill was sent or authorized.
- If the source only documents a charted medication list, prior plan, or refill request, do not rewrite that into "patient continues" or another present-tense medication conclusion unless the source directly supports that present-tense claim. In medication-conflict cases, keep each side explicitly attributed, such as prior plan/chart list versus patient report, and state when the current source does not resolve the actual regimen today.
- If the source says only "about the same" or "nothing major changed," do not convert that into "stable," "unchanged," "no new symptoms," or a fuller symptom review. Preserve that patient wording as literally as possible when the status description is otherwise sparse.
- For extremely sparse input, required sections should stay brutally minimal; if a section has no grounded content, use at most a short statement like "Not documented in source" rather than explanatory filler.
- Use at most one brief documentation-gap statement when it adds clinical value. Do not repeat nearly identical missing-data lines across several sections.
- Do not use note-padding lines such as "No new symptom details were provided" or "Assessment details were not provided in the source" when they make the draft look more complete than the source.
- If the source only documents a refill need, keep that wording narrow; do not imply the refill was sent, authorized, or otherwise completed unless explicitly documented.
- If the source explicitly includes no-SI / no-self-harm / denial-of-plan language, preserve that exact negative safety content rather than omitting it.
- Do not turn named supports or crisis resources into new safety-plan instructions unless that instruction is explicitly documented.

Style target:
- Aim for "my note, but cleaned up" rather than "AI rewrote my note."
- The draft should feel like the same clinician wrote it on a less rushed day.
- If a cleaner sentence can be made without changing meaning or voice, do that. If not, stay literal.

Examples:
Allowed:
- "Symptom review notes continued severe depression, passive SI, poor sleep, and isolating behaviors."
- "Medication review indicates Abilify was added on 3/23/26 and the patient reports tolerating it."
- "Visit date preserved from source when provided."
- "Plan is to continue inpatient treatment and monitoring."
- "Poor insight is noted, as the patient does not believe hospitalization is needed."

Not allowed:
- "Patient is tolerating medication well" unless documented.
- "Medication is effective" unless documented.
- "Inpatient treatments and monitoring will continue" unless directly supported by source language.
- "Thought process linear, insight fair, judgment fair" unless documented.
- "Denies SI/HI/AVH" unless documented.
- Omitting an explicit source date that matters to the note.
- Heading-plus-fragment phrasing that reads like dressed-up bullets.
- Turning a provider's direct wording into generic model-style summary language when lighter cleanup would work.

Missing-information flag examples:
- "Follow-up interval not documented"
- "Side effects not addressed"
- "MSE not provided"
- "Risk assessment details limited"
