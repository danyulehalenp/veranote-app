# Example Input Blueprint: Format And Destination Constraints

## Why This Matters

The mined founder history shows that formatting constraints are not a side issue.
They are part of the real job.

Examples include:

- ASCII-safe output
- destination-specific structure
- template-aware formatting expectations

## Typical Raw Inputs

### Clinician request

- write this in ASCII-safe format
- make this fit the destination system
- use a certain note structure
- keep headings or ordering compatible with the receiving environment

### Content payload

- the normal note-generation material
- or a draft already produced and needing reshaping

## Input Shape Veranote Should Handle

- note request plus output constraints in the same prompt
- destination-specific formatting rules
- structure requests without permission to invent content

## Truth Risks

- letting formatting cleanup alter clinical meaning
- dropping nuance while simplifying output
- confusing style preference with factual content changes

## Review Priorities

- formatting changes should not change clinical truth
- destination compatibility should stay subordinate to source fidelity
- missing details should remain missing even in polished templates

## Likely Veranote Features This Should Drive

- explicit output-destination controls
- export profiles
- safe-format transforms after content review
- formatting constraints treated as a layer, not as the note’s identity

## Example Eval Directions

- same clinical content exported to two different style profiles
- ASCII-safe request with psych-specific wording preserved
- formatting request should not erase uncertainty or conflict
