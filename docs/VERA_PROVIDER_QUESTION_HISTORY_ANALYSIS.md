# Vera Provider Question History Analysis

## 1. Executive Summary

This report analyzes prior exported ChatGPT history from the desktop folder `Chat GPT Conversations` to identify PHI-safe provider question patterns relevant to Vera. The primary source set was the extracted conversation archive:

- `conversations-000.json` through `conversations-015.json`
- supporting inventory files such as `chat.html`, `export_manifest.json`, and assorted pasted text/markdown artifacts

For this task, the clinically relevant signal overwhelmingly came from the `conversations-*.json` files. Product-only artifacts, image files, and unrelated exports were inventoried but not used as the main pattern source.

High-level findings from the pattern scan:

- `887` psych-relevant conversations were identified.
- `8,790` psych-relevant user prompts were identified.
- The strongest repeated use case was not generic knowledge lookup. It was `chart production and chart refinement`.
- The most common title-level families were:
  - discharge summary creation
  - acute psychiatric HPI creation
  - progress note revision
  - adolescent psychiatric evaluation
- The most common message-level categories were:
  - chart-ready wording
  - note-formatting/prompting
  - risk wording
  - medication reference
  - diagnosis/differential
  - substance/intoxication/withdrawal

The historical behavior suggests the provider was using ChatGPT as a mixed tool for:

- note drafting
- note compression and cleanup
- risk wording
- medication and diagnostic support
- discharge and level-of-care language
- medical-versus-psychiatric overlap
- substance-related differential support

The biggest Vera implication is that Vera should not act like a generic chatbot first. She should be shaped around a small set of high-frequency, inpatient-psych-native answer modes:

- chart wording
- workflow help
- factual knowledge
- trusted reference lookup
- provider preference memory

## 2. Top 20 Provider Question Patterns

1. `Discharge summary generation`
   - Repeated requests to create inpatient psychiatric discharge summaries with standard sections and denial-of-symptom status.
2. `Acute inpatient psychiatric HPI generation`
   - Frequent drafting of adult and adolescent admission assessments from mixed subjective and objective inputs.
3. `Progress note improvement`
   - Recurrent requests to improve, tighten, reorganize, or shorten acute inpatient progress notes.
4. `Risk wording and contradiction handling`
   - Frequent prompts around SI/HI wording, denial-versus-collateral mismatch, precautions, and defensible risk framing.
5. `MSE completion and wording`
   - Repeated need to complete MSE sections and phrase affect, speech, thought process, insight, and judgment cleanly.
6. `Medication plan and consent wording`
   - Common requests for chart-ready medication plan language, past trial framing, and guardian/patient consent documentation.
7. `Substance intoxication/withdrawal documentation`
   - High-frequency substance-related prompts, especially detox, withdrawal, UDS limitations, and substance-induced framing.
8. `Psychosis versus substance differential`
   - Repeated scenarios involving hallucinations, paranoia, agitation, or mania-like symptoms with substance confounds.
9. `Collateral integration`
   - Frequent need to merge guardian/family/staff collateral into the assessment without losing chronology or clarity.
10. `Social history compression`
    - Common requests to summarize living situation, school/work, supports, legal issues, goals, and stressors succinctly.
11. `Objective data integration`
    - Repeated use of labs, UDS, UPT, and other objective data to support psychiatric documentation.
12. `Discharge readiness and same-day discharge rationale`
    - Recurrent prompts about why inpatient is or is not still needed, including cases judged not to need inpatient level of care.
13. `Agitation, threats, violence, and behavioral containment`
    - Frequent documentation around aggression, threatening statements, belligerence, and behavior affecting disposition.
14. `Adolescent inpatient psych documentation`
    - Strong repeated sub-pattern for adolescent admissions, family collateral, school issues, running away, and safety concerns.
15. `Consult/H&P and medical-versus-psych overlap`
    - Recurrent prompts blending psychiatric documentation with medical H&P, detox evaluation, delirium-style concern, or consult framing.
16. `Diagnosis and differential clarification`
    - Frequent requests for likely diagnosis, differentials, and how to frame uncertainty without overcommitting.
17. `Formatting and prompt control`
    - Repeated instructions for sentence-paragraph format, no bullets, use psych abbreviations, concise but clinically dense output.
18. `Capacity/legal/hold language`
    - Smaller but important cluster around PEC/CEC/guardianship/consent/hold-adjacent wording.
19. `Coding, billing, and medical necessity`
    - Smaller but repeated requests for ICD/CPT or medical-necessity-style support.
20. `Incomplete note rescue`
    - Repeated need to take sparse, contradictory, or partially organized data and produce a coherent inpatient psych note.

## 3. Common Wording/Request Templates

The most common prompt shapes were imperative and production-oriented rather than open-ended.

Most common shapes seen:

- `Please improve the following acute inpatient ...`
- `Please create a discharge summary for ...`
- `Write an acute adult inpatient psychiatric ...`
- `Write an acute adolescent inpatient psychiatric ...`
- `Please rewrite and keep in sentence/paragraph format ...`
- `For the above patient what would ...`
- `Can you help me write a ...`
- `Please generate a concise ...`
- `Please improve and organize the following ...`

Generalized template families:

- `Please create/write [NOTE TYPE] using the following clinical details.`
- `Please improve/rewrite this inpatient psych note and keep it concise.`
- `Please reorganize this note into paragraph format with psych abbreviations.`
- `For the above patient, what would the most likely diagnosis/differential be?`
- `What should I include for [risk / MSE / collateral / discharge]?`
- `How do I word [risk / psychosis / withdrawal / legal / discharge] more clearly?`
- `Is there enough here to support [inpatient / discharge / detox / safety precautions]?`
- `What meds / labs / detox approach / code would fit this situation?`

## 4. Common Clinical-Documentation Scenarios

These are generalized scenario patterns only. No raw note text is preserved.

### Suicide-risk contradictions

- patient denies intent but collateral or texting history suggests higher concern
- patient later minimizes or retracts suicidal statements
- provider needs defensible language for contradiction without overclaiming

### Psychosis versus substance

- psychotic symptoms appear alongside recent substance use, intoxication, or withdrawal
- provider needs wording that keeps substance-induced explanations active while not missing a primary psychotic process

### Medication refusal / nonadherence

- refusal of detox meds, psychiatric meds, or withdrawal protocols
- prior medication nonadherence complicating disposition and plan wording

### Discharge pressure / same-day discharge

- requests to document why inpatient is no longer indicated
- requests to support discharge despite recent concerning presentation
- tension between presenting severity and current reassessment

### Incomplete MSE

- sparse raw data needing completion into a usable MSE
- repeated need for consistent language across appearance, behavior, thought content, insight, and judgment

### Capacity / legal / hold concerns

- guardian collateral, consent, and hold status affecting chart wording
- need to avoid treating hold status alone as sufficient explanation

### Agitation / violence risk

- threatening statements
- verbal escalation
- aggression toward family/staff/peers
- need for careful wording of behavioral risk without unsupported conclusions

### Medical consult issues

- UDS/UPT/lab integration
- medical findings influencing psychiatric assessment
- withdrawal, delirium, seizure, or medical overlap requiring cautious wording

## 5. Recommended Vera Answer Modes

### `Chart wording`

Use when the provider is clearly asking for note-ready language or section drafting.

Best fit for:

- HPI
- discharge summary
- progress note
- MSE
- risk wording
- collateral wording
- medication plan wording

Recommended response shape:

- short lead sentence
- one chart-ready paragraph or section
- optional missing-data warning

### `Workflow help`

Use when the provider is asking what to include, what is missing, or whether the note supports a decision.

Best fit for:

- discharge readiness
- inpatient necessity support
- risk contradiction handling
- note completeness checks

Recommended response shape:

- likely goal
- top missing elements
- short checklist or concise paragraph

### `Factual knowledge`

Use when the provider wants direct psychiatric facts.

Best fit for:

- diagnosis thresholds
- symptom questions
- medication basics
- substance withdrawal/intoxication distinctions

Recommended response shape:

- direct answer first
- caution or exclusion second
- optional related reference suggestion

### `Trusted reference lookup`

Use when the question is reference-sensitive or likely to benefit from official grounding.

Best fit for:

- coding/billing
- medical necessity
- medication-specific safety details
- legal/regulatory questions

Recommended response shape:

- concise answer
- source-linked caveat
- offer of deeper lookup

### `Provider preference memory`

Use only for stable style preferences, not clinical content.

Best fit for:

- prefers paragraph format
- wants psych abbreviations
- wants concise output
- prefers specific note section order

Recommended response shape:

- implicit application of preference
- no echo unless asked

## 6. Recommended Vera UI Quick Actions

- `Draft HPI`
- `Draft Discharge Summary`
- `Improve Progress Note`
- `Tighten Risk Wording`
- `Complete MSE`
- `Integrate Collateral`
- `Summarize Social History`
- `Build Medication Plan Paragraph`
- `Check Discharge Readiness`
- `Substance vs Primary Psych`
- `Chart-Ready Withdrawal Wording`
- `Medical Data to Psych Note`
- `What’s Missing From This Note?`
- `ICD/CPT Help`
- `Louisiana Inpatient Documentation`

## 7. Recommended Vera Lab Test Additions

### Chart-generation tests

- sparse inpatient data to acute HPI
- mixed subjective/objective data to progress note
- same-day discharge summary from detox-style case

### Risk/documentation tests

- denial versus collateral contradiction
- suicidal statement later minimized
- violence/threat documentation with limited insight
- current reassessment versus old presentation

### MSE tests

- incomplete MSE completion
- inconsistent affect/mood wording cleanup
- psychosis wording with guarded interview

### Substance/differential tests

- substance-induced psychosis versus primary psychosis
- withdrawal versus intoxication
- negative UDS with suspected exposure
- opioid/benzodiazepine/alcohol detox framing

### Workflow tests

- “what is still missing from this note?”
- “does this support discharge?”
- “what should I include?”
- “rewrite this more objectively”

### Reference tests

- ICD/CPT lookup
- medical-necessity support
- hold/legal workflow guidance

## 8. Safety Risks Found in Historical Prompts

### Raw patient narrative pasted into prompts

- historical prompts often contained full clinical narratives with identifying or near-identifying detail
- Vera should avoid persisting raw pasted narratives beyond current session need

### Pressure toward overconfident discharge language

- some prompts explicitly asked for “safe for discharge” phrasing
- Vera should preserve documentation-support framing rather than rubber-stamp disposition

### Risk contradiction smoothing

- prompts often involved denial-versus-collateral mismatch
- Vera should not collapse contradiction into false certainty

### Substance-related diagnostic overreach

- psychosis, mania-like symptoms, and agitation often co-occurred with substance exposure
- Vera should keep substance rule-out active before implying primary psychiatric diagnosis

### Template-driven overdocumentation

- repeated requests for standardized discharge or admission language risk making notes sound too absolute
- Vera should prefer source-faithful wording over polished but unsupported phrasing

### Legal/hold-status shortcuts

- hold status can tempt overreliance in documentation
- Vera should avoid implying that legal status alone resolves medical necessity or reassessment needs

## 9. Suggested Next Implementation Phases

### Phase 1: High-yield charting shortcuts

- discharge summary
- acute inpatient HPI
- progress note refinement
- risk wording
- MSE completion

### Phase 2: Substance-aware inpatient differential layer

- psychosis versus substance
- withdrawal versus intoxication
- chart-ready detox/withdrawal wording
- UDS limitation wording

### Phase 3: Review-mode documentation support

- “what is missing?”
- “does this support continued inpatient?”
- “does this read safe for discharge?”
- “tighten this wording”

### Phase 4: Provider preference memory

- paragraph format
- psych abbreviation preference
- concise style
- preferred note order

### Phase 5: Reference-backed support

- coding/billing
- inpatient medical necessity
- Louisiana-specific documentation rules
- medication/reference lookup

## Appendix: Source Inventory Used

Primary files analyzed:

- `conversations-000.json` through `conversations-015.json`

Secondary inventory checked but de-prioritized:

- `chat.html`
- `export_manifest.json`
- assorted `Pasted text` and `Pasted markdown` artifacts
- image and attachment files

Why the JSON conversation files were prioritized:

- they held the clear provider-question history
- they contained repeated inpatient psych drafting behavior
- they allowed pattern extraction without preserving raw excerpts

