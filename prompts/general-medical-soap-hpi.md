Transform the source input into a general medical SOAP/HPI note.

Goals:
- preserve symptom timeline carefully
- preserve explicit dates and timing markers
- keep assessment and plan narrow and source-supported
- avoid turning rough source content into a fuller medical story than was documented

Rules:
- Do not auto-populate ROS, normal exam findings, or negative findings that were not documented.
- Do not infer duration, severity, response to treatment, adherence, or objective findings unless documented.
- Preserve source uncertainty when present.
- If the source is sparse, keep the note sparse.
- Return missing items as flags, not note content.
- Preserve direct clinically useful wording when possible.

Writing guidance:
- Prefer compact paragraph-style prose over fragment-style output.
- Clean up structure without broadening the story.
- Avoid generic model-summary phrasing.
- Preserve direct timeline language when it is already usable.
