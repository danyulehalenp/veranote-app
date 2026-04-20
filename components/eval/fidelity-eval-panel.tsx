'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fidelityCases } from '@/lib/eval/fidelity-cases';
import { founderWorkflowEvalCases } from '@/lib/eval/founder-workflow-cases';
import { encounterSupportEvalCases } from '@/lib/eval/encounter-support-cases';
import { outpatientPsychEvalCases } from '@/lib/eval/outpatient-psych-cases';
import { phaseTwoTrustEvalCases } from '@/lib/eval/phase-two-trust-cases';
import { getMismatchHints } from '@/lib/eval/mismatch-hints';
import { DRAFT_SESSION_KEY, EVAL_CASE_KEY, EVAL_SCORECARD_KEY } from '@/lib/constants/storage';
import { createDefaultEvalScorecard, deriveProvisionalEvalTriage, getRubricTotal, rubricCategoryLabels } from '@/lib/eval/results-history';
import type { EvalCaseSelection, EvalRubricCategoryKey, EvalScorecard } from '@/types/eval';
import type { DraftSession } from '@/types/session';

const criticalFailureOptions = [
  'Invented suicidal/homicidal ideation status',
  'Invented medication, dose, or change',
  'Invented follow-up plan or treatment decision',
  'Incorrect attribution of collateral vs patient statements',
  'Reversal of negation or uncertainty',
  'Fabricated objective findings',
];

const emphasisStyles: Record<EvalRubricCategoryKey, string> = {
  factGrounding: 'border-sky-200 bg-sky-50 text-sky-950',
  medicationFidelity: 'border-rose-200 bg-rose-50 text-rose-950',
  negationFidelity: 'border-slate-200 bg-slate-50 text-slate-900',
  timelineFidelity: 'border-amber-200 bg-amber-50 text-amber-950',
  attributionFidelity: 'border-violet-200 bg-violet-50 text-violet-950',
  missingDataBehavior: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  contradictionHandling: 'border-orange-200 bg-orange-50 text-orange-950',
  templateUsefulness: 'border-cyan-200 bg-cyan-50 text-cyan-950',
};

export function FidelityEvalPanel() {
  const router = useRouter();
  const allEvalCases = useMemo(
    () => [...fidelityCases, ...founderWorkflowEvalCases, ...outpatientPsychEvalCases, ...encounterSupportEvalCases, ...phaseTwoTrustEvalCases],
    [],
  );
  const [selectedId, setSelectedId] = useState(allEvalCases[0]?.id ?? '');
  const [scorecard, setScorecard] = useState<EvalScorecard>(createDefaultEvalScorecard());
  const [message, setMessage] = useState('');

  const selectedCase = allEvalCases.find((item) => item.id === selectedId) ?? allEvalCases[0];
  const mismatchHints = useMemo(() => {
    if (!selectedCase) {
      return null;
    }

    return getMismatchHints({
      selectedCase,
      outputSnapshot: scorecard.outputSnapshot,
      outputFlagsSnapshot: scorecard.outputFlagsSnapshot,
    });
  }, [scorecard.outputFlagsSnapshot, scorecard.outputSnapshot, selectedCase]);
  const provisionalTriage = useMemo(() => {
    if (!selectedCase || !scorecard.outputSnapshot.trim()) {
      return null;
    }

    return deriveProvisionalEvalTriage({
      selectedCase,
      outputSnapshot: scorecard.outputSnapshot,
      outputFlagsSnapshot: scorecard.outputFlagsSnapshot,
    });
  }, [scorecard.outputFlagsSnapshot, scorecard.outputSnapshot, selectedCase]);

  useEffect(() => {
    const pendingEvalCase = localStorage.getItem(EVAL_CASE_KEY);
    if (!pendingEvalCase) {
      return;
    }

    try {
      const parsed = JSON.parse(pendingEvalCase) as EvalCaseSelection;
      const matchedCase = allEvalCases.find((item) => item.title === parsed.title || item.id === parsed.id);
      if (matchedCase) {
        setSelectedId(matchedCase.id);
      }
    } catch {
      // Ignore malformed pending eval selection and leave current case alone.
    }
  }, [allEvalCases]);

  useEffect(() => {
    if (!selectedCase) {
      return;
    }

    const raw = localStorage.getItem(`${EVAL_SCORECARD_KEY}:${selectedCase.id}`);
    if (!raw) {
      setScorecard(createDefaultEvalScorecard());
      return;
    }

    try {
      const parsed = JSON.parse(raw) as EvalScorecard;
      setScorecard({
        ...createDefaultEvalScorecard(),
        ...parsed,
        rubricScores: {
          ...createDefaultEvalScorecard().rubricScores,
          ...(parsed.rubricScores || {}),
        },
        criticalFailures: Array.isArray(parsed.criticalFailures) ? parsed.criticalFailures : [],
      });
    } catch {
      localStorage.removeItem(`${EVAL_SCORECARD_KEY}:${selectedCase.id}`);
      setScorecard(createDefaultEvalScorecard());
    }
  }, [selectedCase]);

  if (!selectedCase) {
    return null;
  }

  function updateScorecard<K extends keyof EvalScorecard>(key: K, value: EvalScorecard[K]) {
    setScorecard((current) => ({ ...current, [key]: value }));
  }

  function updateRubricScore(key: EvalRubricCategoryKey, value: 0 | 1 | 2) {
    setScorecard((current) => ({
      ...current,
      rubricScores: {
        ...current.rubricScores,
        [key]: value,
      },
    }));
  }

  function toggleCriticalFailure(label: string) {
    setScorecard((current) => ({
      ...current,
      criticalFailures: current.criticalFailures.includes(label)
        ? current.criticalFailures.filter((item) => item !== label)
        : [...current.criticalFailures, label],
    }));
  }

  function handleLoadCase() {
    const payload: EvalCaseSelection = {
      id: selectedCase.id,
      specialty: selectedCase.specialty,
      noteType: selectedCase.noteType,
      title: selectedCase.title,
      sourceInput: selectedCase.sourceInput,
    };

    localStorage.setItem(EVAL_CASE_KEY, JSON.stringify(payload));
    router.push('/dashboard/new-note');
  }

  function handleCaptureLatestOutput() {
    const raw = localStorage.getItem(DRAFT_SESSION_KEY);
    if (!raw) {
      flash('No current draft session found to capture.');
      return;
    }

    try {
      const parsed = JSON.parse(raw) as DraftSession;
      setScorecard((current) => ({
        ...current,
        outputSnapshot: parsed.note || '',
        outputFlagsSnapshot: Array.isArray(parsed.flags) ? parsed.flags.join('\n') : '',
        reviewedAt: new Date().toISOString(),
      }));
      flash('Captured the latest draft output into this scorecard.');
    } catch {
      flash('Unable to read the current draft session for capture.');
    }
  }

  function handleSaveScorecard() {
    const nextScorecard = { ...scorecard, reviewedAt: new Date().toISOString() };
    setScorecard(nextScorecard);
    localStorage.setItem(`${EVAL_SCORECARD_KEY}:${selectedCase.id}`, JSON.stringify(nextScorecard));
    flash(`Saved scorecard for case ${selectedCase.id}.`);
  }

  function handleApplyProvisionalTriage() {
    if (!provisionalTriage) {
      flash('Capture or paste output first so provisional triage has something to inspect.');
      return;
    }

    setScorecard((current) => ({
      ...current,
      stoplight: provisionalTriage.suggestedStoplight,
      overallRating: provisionalTriage.suggestedOverallRating,
      criticalFailures: Array.from(new Set([...current.criticalFailures, ...provisionalTriage.suggestedCriticalFailures])),
      failuresFound: current.failuresFound.trim()
        ? current.failuresFound
        : provisionalTriage.summaryLines.join(' '),
      notes: current.notes.trim()
        ? current.notes
        : 'Provisional triage applied from automatic mismatch/high-risk heuristics. Manual reviewer confirmation still required.',
    }));
    flash('Applied provisional triage suggestions to the scorecard. Please review before saving.');
  }

  async function handleGenerateProvisionalScorecard() {
    if (!selectedCase || !['39', '40', '41', '42'].includes(selectedCase.id)) {
      flash('This helper is only enabled for the dedicated Phase 2 trust cases.');
      return;
    }

    try {
      const response = await fetch('/api/generate-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialty: selectedCase.specialty,
          noteType: selectedCase.noteType,
          outputStyle: 'Standard',
          format: 'Labeled Sections',
          keepCloserToSource: true,
          flagMissingInfo: true,
          sourceInput: selectedCase.sourceInput,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Unable to generate provisional output right now.');
      }

      const provisional = deriveProvisionalEvalTriage({
        selectedCase,
        outputSnapshot: typeof data?.note === 'string' ? data.note : '',
        outputFlagsSnapshot: Array.isArray(data?.flags) ? data.flags.join('\n') : '',
      });

      const nextScorecard: EvalScorecard = {
        ...createDefaultEvalScorecard(),
        ...scorecard,
        stoplight: provisional.suggestedStoplight,
        overallRating: provisional.suggestedOverallRating,
        criticalFailures: Array.from(new Set([...scorecard.criticalFailures, ...provisional.suggestedCriticalFailures])),
        failuresFound: provisional.summaryLines.join(' '),
        notes: 'Provisional Phase 2 trust scorecard generated automatically from the current source case. Reviewer confirmation still required.',
        outputSnapshot: typeof data?.note === 'string' ? data.note : '',
        outputFlagsSnapshot: Array.isArray(data?.flags) ? data.flags.join('\n') : '',
        reviewedAt: new Date().toISOString(),
      };

      setScorecard(nextScorecard);
      localStorage.setItem(`${EVAL_SCORECARD_KEY}:${selectedCase.id}`, JSON.stringify(nextScorecard));
      flash(`Generated and saved a provisional scorecard for case ${selectedCase.id}. Please review it before treating it as final.`);
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Unable to generate a provisional scorecard right now.');
    }
  }

  function flash(value: string) {
    setMessage(value);
    window.setTimeout(() => setMessage(''), 2200);
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[320px_1fr] md:items-end">
          <label className="grid gap-2 text-sm font-medium text-ink">
              <span>Evaluation case</span>
              <select value={selectedCase.id} onChange={(event) => setSelectedId(event.target.value)} className="rounded-lg border border-border bg-white p-3">
              {allEvalCases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} — {item.title}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            Built from the real eval-case docs, founder workflow regressions, the outpatient psych readiness set, the encounter-support regression set, and the dedicated Phase 2 trust set.
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Case under test</h2>
              <div className="mt-3 text-sm text-muted">{selectedCase.specialty} • {selectedCase.noteType}</div>
              <div className="mt-1 rounded-full bg-paper px-3 py-1 text-xs font-medium text-muted inline-block">Risk focus: {selectedCase.riskFocus}</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleLoadCase} className="rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white">Load into New Note</button>
              <Link href="/dashboard/review" className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium">Open Review</Link>
            </div>
          </div>

          {selectedCase.id.startsWith('fw-') ? (
            <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
              Founder workflow eval case. Useful for product-shaping and founder-fit regression checks, but not a substitute for broader provider beta coverage.
            </div>
          ) : null}

          {['35', '36', '37', '38'].includes(selectedCase.id) ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              Encounter-support eval case. Use this set to check whether telehealth, psychotherapy-time, interactive-complexity, and crisis-support structure makes the note more reviewable without turning Veranote into a fake coding engine.
            </div>
          ) : null}

          {['39', '40', '41', '42'].includes(selectedCase.id) ? (
            <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
              Phase 2 trust eval case. Use this set to pressure-test the visible trust upgrades: objective conflict handling, medication truth, diagnosis caution, and passive-versus-acute risk wording.
            </div>
          ) : null}

          {selectedCase.rubricEmphasis?.length || selectedCase.reviewPrompts?.length ? (
            <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4">
              <div className="text-sm font-semibold text-sky-950">Workflow scoring guidance</div>
              <p className="mt-1 text-xs text-sky-900">
                Use these prompts to bias your review toward the failure modes this workflow is most likely to hide behind polished prose.
              </p>
              {selectedCase.rubricEmphasis?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedCase.rubricEmphasis.map((key) => (
                    <span key={key} className={`rounded-full border px-3 py-1 text-xs font-medium ${emphasisStyles[key]}`}>
                      Emphasize: {rubricCategoryLabels[key]}
                    </span>
                  ))}
                </div>
              ) : null}
              {selectedCase.reviewPrompts?.length ? (
                <ul className="mt-3 space-y-2 text-sm text-sky-950">
                  {selectedCase.reviewPrompts.map((item) => (
                    <li key={item} className="rounded-lg border border-sky-100 bg-white p-3">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 space-y-5">
            <Block title="Raw input"><pre className="whitespace-pre-wrap rounded-lg bg-paper p-4 text-sm text-ink">{selectedCase.sourceInput}</pre></Block>
            <Block title="Expected truths that must survive"><BulletList items={selectedCase.expectedTruths} /></Block>
            <Block title="Things the model must not add"><BulletList items={selectedCase.forbiddenAdditions} /></Block>
            <Block title="Known ambiguity that should stay ambiguous"><BulletList items={selectedCase.knownAmbiguities} /></Block>
          </div>
        </section>

        <section className="grid gap-6">
          {mismatchHints ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-amber-950">Automatic mismatch hints</h2>
              <p className="mt-1 text-sm text-amber-900">Cheap heuristics only. Useful for triage, not a replacement for clinician review.</p>
              <div className="mt-4 grid gap-4">
                <HintList title="Missing expected flags" items={mismatchHints.missingExpectedTruths} emptyText="No obvious expected-flag misses detected." />
                <HintList title="Forbidden additions found" items={mismatchHints.forbiddenAdditionsFound} emptyText="No obvious forbidden additions detected." />
                <HintList title="Missing explicit dates" items={mismatchHints.missingExplicitDates} emptyText="No explicit source dates appear to be missing." />
                <HintList title="High-risk warning coverage" items={mismatchHints.highRiskWarnings} emptyText="No high-risk drift warnings fired for this output." />
              </div>
            </div>
          ) : null}

          {['39', '40', '41', '42'].includes(selectedCase.id) && provisionalTriage ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-sky-950">Phase 2 closeout helper</h2>
                  <p className="mt-1 text-sm text-sky-900">
                    This is a provisional triage read from mismatch hints and high-risk heuristics. It is meant to speed up scoring, not replace reviewer judgment.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleGenerateProvisionalScorecard} className="rounded-lg border border-sky-200 bg-white px-4 py-3 text-sm font-medium text-sky-950">
                    Generate provisional scorecard
                  </button>
                  <button onClick={handleApplyProvisionalTriage} className="rounded-lg border border-sky-200 bg-white px-4 py-3 text-sm font-medium text-sky-950">
                    Apply provisional triage
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-sky-200 bg-white p-4 text-sm text-sky-950">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">Suggested stoplight</div>
                  <div className="mt-2 text-lg font-semibold">{provisionalTriage.suggestedStoplight}</div>
                </div>
                <div className="rounded-lg border border-sky-200 bg-white p-4 text-sm text-sky-950">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">Suggested result</div>
                  <div className="mt-2 text-lg font-semibold">{provisionalTriage.suggestedOverallRating}</div>
                </div>
                <div className="rounded-lg border border-sky-200 bg-white p-4 text-sm text-sky-950">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">Mismatch totals</div>
                  <div className="mt-2 text-sm">
                    {provisionalTriage.mismatchCounts.missingExpectedTruths} missing truths • {provisionalTriage.mismatchCounts.forbiddenAdditions} forbidden adds
                  </div>
                </div>
                <div className="rounded-lg border border-sky-200 bg-white p-4 text-sm text-sky-950">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">Risk cues</div>
                  <div className="mt-2 text-sm">
                    {provisionalTriage.mismatchCounts.highRiskWarnings} high-risk • {provisionalTriage.mismatchCounts.missingExplicitDates} date-anchor misses
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-sky-200 bg-white p-4 text-sm text-sky-950">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">Provisional summary</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {provisionalTriage.summaryLines.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-sky-200 bg-white p-4 text-sm text-sky-950">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">Provisional critical failures</div>
                  {provisionalTriage.suggestedCriticalFailures.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {provisionalTriage.suggestedCriticalFailures.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-2 text-sm text-sky-900">No critical failure was heuristically suggested. Manual review still matters.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Regression scorecard</h2>
                <p className="mt-1 text-sm text-muted">Score the actual fidelity dimensions from the checklist. The total is only a summary; critical failures still matter more than pretty math.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button onClick={handleCaptureLatestOutput} className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium">Capture Latest Output</button>
                <button onClick={handleSaveScorecard} className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium">Save Scorecard</button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Field label="Regression run label">
                <input value={scorecard.regressionRunLabel} onChange={(event) => updateScorecard('regressionRunLabel', event.target.value)} className="rounded-lg border border-border p-3" placeholder="ex: 2026-03-30 prompt tweak pass" />
              </Field>
              <Field label="Stoplight rating">
                <select value={scorecard.stoplight} onChange={(event) => updateScorecard('stoplight', event.target.value as EvalScorecard['stoplight'])} className="rounded-lg border border-border bg-white p-3">
                  <option>Green</option><option>Yellow</option><option>Red</option>
                </select>
              </Field>
              <Field label="Overall result">
                <select value={scorecard.overallRating} onChange={(event) => updateScorecard('overallRating', event.target.value as EvalScorecard['overallRating'])} className="rounded-lg border border-border bg-white p-3">
                  <option>Pass</option><option>Needs revision</option><option>Fail</option>
                </select>
              </Field>
            </div>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink">Rubric scoring</div>
                  <p className="mt-1 text-xs text-muted">2 = good, 1 = mixed, 0 = failed/concerning</p>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-muted">Total: {getRubricTotal(scorecard)} / 16</div>
              </div>
              <div className="mt-4 grid gap-3">
                {(Object.entries(rubricCategoryLabels) as Array<[EvalRubricCategoryKey, string]>).map(([key, label]) => (
                  <div
                    key={key}
                    className={`grid gap-2 rounded-lg p-3 md:grid-cols-[1fr_auto] md:items-center ${
                      selectedCase.rubricEmphasis?.includes(key) ? emphasisStyles[key] : 'bg-white'
                    }`}
                  >
                    <div className="text-sm text-ink">{label}</div>
                    <div className="flex gap-2">
                      {[0, 1, 2].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => updateRubricScore(key, value as 0 | 1 | 2)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${scorecard.rubricScores[key] === value ? 'border-accent bg-accent text-white' : 'border-border bg-white text-ink'}`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4">
              <div className="text-sm font-semibold text-rose-950">Critical failures</div>
              <p className="mt-1 text-xs text-rose-900">Any one of these can make the case a fail even if the prose looked slick.</p>
              <div className="mt-3 grid gap-2">
                {criticalFailureOptions.map((item) => (
                  <label key={item} className="flex items-start gap-3 rounded-lg bg-white p-3 text-sm text-ink">
                    <input type="checkbox" checked={scorecard.criticalFailures.includes(item)} onChange={() => toggleCriticalFailure(item)} />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <TextAreaField label="Failures found" value={scorecard.failuresFound} onChange={(value) => updateScorecard('failuresFound', value)} placeholder="List the drift or unsupported claims you found." />
              <TextAreaField label="Unsupported text example" value={scorecard.unsupportedTextExample} onChange={(value) => updateScorecard('unsupportedTextExample', value)} placeholder="Paste the concerning sentence or phrase." />
              <TextAreaField label="Recommended fix" value={scorecard.recommendedFix} onChange={(value) => updateScorecard('recommendedFix', value)} placeholder="What should change in prompt/review/UI next?" />
              <TextAreaField label="Reviewer notes" value={scorecard.notes} onChange={(value) => updateScorecard('notes', value)} placeholder="Anything else worth remembering for this regression run." />
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <TextAreaField label="Output snapshot" value={scorecard.outputSnapshot} onChange={(value) => updateScorecard('outputSnapshot', value)} className="min-h-[220px] font-mono text-sm" placeholder="Paste or capture the generated note here." />
              <TextAreaField label="Flags snapshot" value={scorecard.outputFlagsSnapshot} onChange={(value) => updateScorecard('outputFlagsSnapshot', value)} className="min-h-[220px] text-sm" placeholder="Paste or capture generated flags here, one per line." />
            </div>

            {scorecard.reviewedAt ? <div className="mt-3 text-sm text-muted">Last saved/captured: {new Date(scorecard.reviewedAt).toLocaleString()}</div> : null}
            {message ? <div className="mt-2 text-sm text-muted">{message}</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3 text-sm text-ink">
      {items.map((item) => <li key={item} className="rounded-lg bg-paper p-3">{item}</li>)}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium text-ink"><span>{label}</span>{children}</label>;
}

function TextAreaField({ label, value, onChange, placeholder, className = 'min-h-[120px]' }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-ink">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className={`rounded-lg border border-border p-3 ${className}`} placeholder={placeholder} />
    </label>
  );
}

function HintList({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-900">{title}</h3>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm text-ink">{items.map((item) => <li key={item} className="rounded-lg bg-paper p-3">{item}</li>)}</ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{emptyText}</p>
      )}
    </div>
  );
}
