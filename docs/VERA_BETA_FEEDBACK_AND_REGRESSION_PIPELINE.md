# Vera Beta Feedback And Regression Pipeline

## Purpose
This workflow gives beta providers a fast way to report what went well, what needs work, and where Vera missed the mark without interrupting normal documentation flow.

It also gives the internal team a structured path to review failures and turn them into Vera Lab regression candidates after human review.

## What beta users can report
- Helpful output
- Needs work
- Clinically wrong output
- Missing key fact
- Too generic output
- Too long output
- Invented something
- Unsafe wording
- Other concerns

Beta users can optionally add:
- What was wrong
- What Vera should have done

## PHI safety rules
- Do not store raw patient names, DOBs, MRNs, addresses, or full note text by default.
- Store compact sanitized prompt and response summaries instead of full raw transcripts.
- Show a reminder in the UI telling users not to include identifiers in feedback.
- Mark potential PHI risk if feedback comments appear to contain identifiers.
- Keep any regression scaffold based on sanitized summaries only.

## Feedback statuses
- `new`: submitted and not yet reviewed
- `reviewed`: seen by admin and triaged
- `needs_regression`: should likely become a Vera Lab case after manual review
- `converted`: manually converted into a regression candidate or approved follow-up artifact
- `dismissed`: not actionable or duplicate

Legacy statuses may still appear on older items, but new beta triage should use the statuses above.

## Admin review workflow
1. Open `/admin/beta-feedback`.
2. Filter by workflow area, label, severity, status, or conversion state.
3. Review the sanitized prompt summary, response summary, and optional provider comments.
4. Add admin notes if useful.
5. Mark the item as `reviewed`, `needs_regression`, `converted`, or `dismissed`.
6. Copy the regression scaffold when the issue is ready for manual Vera Lab review.

## How to convert feedback into Vera Lab regression cases
1. Review the feedback record and make sure the issue is real and reproducible.
2. Copy the generated regression scaffold from the admin page.
3. Rewrite the prompt pattern into a PHI-safe synthetic test case.
4. Fill in:
   - expected behavior
   - must include items
   - must not include items
   - expected answer mode
   - severity if wrong
5. Manually review and approve before adding anything to the Vera Lab question bank.

## What must never be automated
- No auto-patching of Vera
- No auto-approval of regression cases
- No raw PHI storage by default
- No automatic addition to the Vera Lab question bank
