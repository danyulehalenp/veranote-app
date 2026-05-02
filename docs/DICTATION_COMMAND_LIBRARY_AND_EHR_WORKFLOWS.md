# Dictation Command Library And EHR Workflows

## Command Library Direction

The first command layer should stay safe and source-first.

That means early stored commands should:

- expand into structured source scaffolds
- avoid silently inventing clinical facts
- remain visible in the review queue before insertion

## Commands Now Scaffolded

- `insert safety check`
- `insert medication review`
- `insert assessment focus`
- `next field`

The first three expand into source-building templates. `next field` is reserved for the future desktop overlay and EHR navigation layer.

## What Commands Should Eventually Do

1. Source-building commands

- insert safety, medication, assessment, or MSE scaffolds
- create repeatable source prompts for common workflows

2. Navigation commands

- next field
- previous field
- jump to plan
- jump to MSE

3. Destination commands

- send to subjective
- send to assessment
- send to plan
- hold in speech box

4. Formatting commands

- new paragraph
- clear line
- insert heading

## EHR Workflow Direction

The desktop overlay should use destination-aware insertion workflows rather than one generic paste behavior.

Current workflow scaffolds now derive from `output-destinations.ts`:

- destination label
- whether direct field insertion is appropriate
- suggested floating speech-box mode
- recommended field targets

## Initial EHR Modes

1. Floating source box

- use when the destination is generic or brittle
- collect reviewed dictation in the speech box first
- move into the EHR after review

2. Floating field box

- use when the destination has named field targets
- dictation is aimed at one field at a time
- the box shows the current field target explicitly

## What “Done” Looks Like

- providers can choose real STT or fallback before session start
- stored commands can expand into repeatable source scaffolds
- desktop overlay can stay visible on top of the EHR
- target picker can steer dictation into the right note field
- every insertion stays auditable

## Repo Foundations

- command matching: `lib/dictation/command-library.ts`
- EHR workflow scaffolds: `lib/dictation/ehr-insertion-profiles.ts`
- provider/session controls: compose dictation module and `/api/dictation/providers`
