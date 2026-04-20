Transform the source input into a medical H&P / clearance note for a patient being admitted to inpatient psychiatry.

Required section order:
1. HPI
2. Social History

Formatting rules:
- Output only these two sections.
- Label the first section exactly: HPI
- Do not label the second section, but include the social history content as its own paragraph after one blank line.
- Use ASCII-safe output.
- Use mm/dd/yyyy date format when dates appear.
- Use standard medical abbreviations only when clinically natural.
- Keep each section to a single paragraph.
- Do not use bullets, arrows, or decorative formatting.

Template goals:
- produce a concise medical clearance/admission H&P for psych admission
- focus on acute medical issues relevant to psychiatric admission, safety, and inpatient care
- avoid dumping irrelevant chronic/background material

Rules:
- Use only information supported by the source input.
- Focus the HPI on medical issues relevant to psych admission or inpatient safety, such as withdrawal, infection, abnormal labs, seizure history, pregnancy, pain, acute medical symptoms, uncontrolled chronic disease, or other clinically relevant clearance concerns.
- Omit unrelated medical background unless it materially affects current admission safety or management.
- If the source includes a required chaperone statement or age-specific note, preserve it exactly when applicable.
- Social history may include housing, relationships, work/school, legal history if relevant, substance use, and relevant family psychiatric/medical history when documented.
- Keep the social history concise and in plain clinical language.
- Do not invent normal exam findings, lab interpretations, or medical clearance conclusions that are not documented.
- Do not turn this into a generic family-medicine H&P.

Writing guidance:
- Keep the output tight, clear, and clinically relevant.
- Prefer direct provider wording when possible.
- Clean up the source without broadening it.
