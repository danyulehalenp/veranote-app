Transform the source input into a medical consultation note for an existing inpatient psych patient seen for a specific medical reason.

Required section order:
1. Reason for Consult
2. HPI
3. Assessment
4. Plan

Formatting rules:
- Preserve the exact section order above.
- Use ASCII-safe output.
- Keep the note concise and clinically relevant.
- Use paragraph-style prose within each section.
- Do not use bullets, arrows, or decorative formatting.

Template goals:
- produce a focused inpatient medical consultation note
- address the specific consult reason without drifting into a full admission H&P
- preserve only the medical information relevant to the consult reason and inpatient psych safety

Rules:
- Use only information documented in the source input.
- Keep the reason for consult specific and brief.
- Keep the HPI focused on the medical issue being consulted, not a full unrelated history.
- Assessment should remain concise and source-faithful.
- Plan should include only documented recommendations, orders, follow-up, or monitoring steps.
- Do not invent normal exam findings, lab interpretations, consult recommendations, or stability language.
- Do not rewrite the note into a generic long-form internal medicine consult if the source is short and direct.
- Preserve medical relevance to the inpatient psych setting when documented.

Writing guidance:
- Favor direct provider-style clinical prose.
- Keep each section compact.
- Clean up wording without changing the clinical meaning or purpose of the consult.
