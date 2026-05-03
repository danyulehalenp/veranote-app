# Document Upload And OCR Blueprint

## Goal

Let providers upload or paste outside records, referral documents, ER packets, scanned PDFs, and prior notes so Veranote can extract clinically relevant source material before generating a note.

This is a planning blueprint only. It does not implement storage, OCR, PHI processing, or production ingestion.

## Provider Workflow

1. Provider adds a document to the source packet.
2. Veranote extracts readable text when possible.
3. If the document is scanned, OCR creates a draft extraction.
4. Veranote classifies extracted material into source buckets:
   - Pre-visit data
   - Prior provider/referral history
   - Labs/vitals/imaging
   - Medications/allergies
   - Psychiatric history
   - Substance history
   - Social history
   - Risk/safety information
   - Collateral conflicts
5. Provider reviews and approves extracted source before note generation.
6. Note generation uses only reviewed source and preserves uncertainty.

## Safety Rules

- Never silently convert OCR text into confirmed clinical facts.
- Mark low-confidence OCR spans as uncertain.
- Preserve source attribution, such as referral, ER note, scanned document, collateral, or patient report.
- Never erase contradictions between the uploaded document and the live encounter.
- Do not generate a diagnosis, clearance, discharge readiness statement, or medication decision from uploaded records alone.
- Do not store or display raw PHI outside the intended app workflow.

## Technical Architecture

```text
Upload or paste document
-> File type validation
-> Text extraction for typed PDFs/docs
-> OCR for scanned PDFs/images
-> OCR confidence and page mapping
-> Clinical source classifier
-> Provider review screen
-> Approved source packet
-> Note generation
-> Audit trail of source document references
```

## Supported File Targets

Initial supported targets should be:

- PDF with selectable text
- Scanned PDF
- PNG/JPEG images
- DOCX referral note
- Plain text copied from another EHR

Avoid complex batch import until the single-document review loop is reliable.

## Extracted Source Schema

Each extracted item should include:

- `sourceDocumentId`
- `pageNumber`
- `sourceType`
- `bucket`
- `text`
- `confidence`
- `requiresReview`
- `providerAccepted`
- `sourceLabel`

## Review UI Recommendation

The review screen should be split:

- Left: source document/page preview.
- Right: extracted clinical facts grouped by bucket.
- Each extraction has accept, edit, reject, and source-page jump.
- Low-confidence OCR is highlighted.
- Contradictions are shown as review flags, not hidden.

## First MVP

The first implementation should only extract text and route it into the existing four source fields:

- Pre-visit data
- Live visit notes
- Ambient transcript
- Provider add-on

For scanned documents, the MVP can require provider confirmation before generation.

## Later Expansion

- Table extraction for labs.
- Medication reconciliation from scanned records.
- Duplicate document detection.
- Multiple document packets.
- Source-linked citations in generated drafts.
- Facility-specific document categories.
