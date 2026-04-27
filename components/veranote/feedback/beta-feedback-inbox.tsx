'use client';

import { useMemo, useState } from 'react';
import { buildFeedbackRegressionScaffold } from '@/lib/beta/feedback-regression';
import type {
  BetaFeedbackItem,
  BetaFeedbackLabel,
  BetaFeedbackSeverity,
  BetaFeedbackStatus,
  BetaFeedbackWorkflowArea,
} from '@/types/beta-feedback';

type BetaFeedbackInboxProps = {
  feedback: BetaFeedbackItem[];
};

const workflowAreaLabels: Record<BetaFeedbackWorkflowArea, string> = {
  note_builder: 'Note builder',
  vera_assistant: 'Atlas assistant',
  medication_reference: 'Medication reference',
  switching_framework: 'Switching framework',
};

const feedbackLabelLabels: Record<BetaFeedbackLabel, string> = {
  helpful: 'Helpful',
  'needs-work': 'Needs work',
  'clinically-wrong': 'Clinically wrong',
  'missing-key-fact': 'Missing key fact',
  'too-generic': 'Too generic',
  'too-long': 'Too long',
  'invented-something': 'Invented something',
  'unsafe-wording': 'Unsafe wording',
  other: 'Other',
};

const statusLabels: Record<BetaFeedbackStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  needs_regression: 'Needs regression',
  converted: 'Converted',
  dismissed: 'Dismissed',
  planned: 'Planned',
  taught: 'Taught',
};

const severityLabels: Record<BetaFeedbackSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export function BetaFeedbackInbox({ feedback }: BetaFeedbackInboxProps) {
  const [items, setItems] = useState(feedback);
  const [workflowArea, setWorkflowArea] = useState<BetaFeedbackWorkflowArea | 'all'>('all');
  const [feedbackLabel, setFeedbackLabel] = useState<BetaFeedbackLabel | 'all'>('all');
  const [severity, setSeverity] = useState<BetaFeedbackSeverity | 'all'>('all');
  const [status, setStatus] = useState<BetaFeedbackStatus | 'all'>('all');
  const [converted, setConverted] = useState<'all' | 'converted' | 'not-converted'>('all');
  const [adminNotesDrafts, setAdminNotesDrafts] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState('');

  const orderedItems = useMemo(() => [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ), [items]);

  const filteredItems = useMemo(() => orderedItems.filter((item) => {
    if (workflowArea !== 'all' && item.workflowArea !== workflowArea && item.metadata?.workflowArea !== workflowArea) {
      return false;
    }

    if (feedbackLabel !== 'all' && item.feedbackLabel !== feedbackLabel && item.metadata?.feedbackLabel !== feedbackLabel) {
      return false;
    }

    if (severity !== 'all' && item.severity !== severity && item.metadata?.severity !== severity) {
      return false;
    }

    if (status !== 'all' && item.status !== status) {
      return false;
    }

    if (converted === 'converted' && !item.convertedToRegression) {
      return false;
    }

    if (converted === 'not-converted' && item.convertedToRegression) {
      return false;
    }

    return true;
  }), [converted, feedbackLabel, orderedItems, severity, status, workflowArea]);

  const summary = useMemo(() => ({
    total: items.length,
    newCount: items.filter((item) => item.status === 'new').length,
    needsRegressionCount: items.filter((item) => item.status === 'needs_regression').length,
    convertedCount: items.filter((item) => item.convertedToRegression || item.status === 'converted').length,
  }), [items]);

  async function updateItem(id: string, patch: {
    status?: BetaFeedbackStatus;
    adminNotes?: string;
    convertedToRegression?: boolean;
    regressionCaseId?: string;
  }) {
    const response = await fetch('/api/beta-feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });

    const data = await response.json() as { feedback?: BetaFeedbackItem; error?: string };

    if (!response.ok || !data.feedback) {
      throw new Error(data.error || 'Unable to update feedback right now.');
    }

    setItems((current) => current.map((item) => item.id === id ? data.feedback as BetaFeedbackItem : item));
  }

  async function copyScaffold(item: BetaFeedbackItem) {
    const scaffold = buildFeedbackRegressionScaffold(item);
    const serialized = JSON.stringify(scaffold, null, 2);

    try {
      await navigator.clipboard.writeText(serialized);
    } finally {
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(''), 2000);
    }
  }

  if (!items.length) {
    return (
      <div className="aurora-panel rounded-[28px] p-6">
        <h2 className="text-lg font-semibold">No beta feedback yet</h2>
        <p className="mt-2 text-sm text-muted">Once providers submit in-flow feedback, it will appear here for review and regression triage.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Inbox items" value={summary.total} />
        <SummaryCard label="New" value={summary.newCount} />
        <SummaryCard label="Needs regression" value={summary.needsRegressionCount} />
        <SummaryCard label="Converted" value={summary.convertedCount} />
      </section>

      <section className="aurora-panel rounded-[28px] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Beta feedback filters</div>
            <div className="mt-1 text-sm text-cyan-50/78">Filter by workflow area, feedback type, severity, status, or conversion state.</div>
          </div>
          <div className="text-xs text-cyan-50/64">Showing {filteredItems.length} of {items.length}</div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-5">
          <FilterSelect
            label="Workflow area"
            value={workflowArea}
            onChange={(value) => setWorkflowArea(value as BetaFeedbackWorkflowArea | 'all')}
            options={[
              ['all', 'All workflow areas'],
              ...Object.entries(workflowAreaLabels),
            ]}
          />
          <FilterSelect
            label="Feedback"
            value={feedbackLabel}
            onChange={(value) => setFeedbackLabel(value as BetaFeedbackLabel | 'all')}
            options={[
              ['all', 'All feedback labels'],
              ...Object.entries(feedbackLabelLabels),
            ]}
          />
          <FilterSelect
            label="Severity"
            value={severity}
            onChange={(value) => setSeverity(value as BetaFeedbackSeverity | 'all')}
            options={[
              ['all', 'All severities'],
              ...Object.entries(severityLabels),
            ]}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(value) => setStatus(value as BetaFeedbackStatus | 'all')}
            options={[
              ['all', 'All statuses'],
              ...Object.entries(statusLabels),
            ]}
          />
          <FilterSelect
            label="Converted"
            value={converted}
            onChange={(value) => setConverted(value as 'all' | 'converted' | 'not-converted')}
            options={[
              ['all', 'All items'],
              ['converted', 'Converted'],
              ['not-converted', 'Not converted'],
            ]}
          />
        </div>
      </section>

      <div className="grid gap-4">
        {!filteredItems.length ? (
          <div className="aurora-panel rounded-[28px] p-5 text-sm text-cyan-50/78">
            No feedback matches the current filters.
          </div>
        ) : null}

        {filteredItems.map((item) => {
          const effectiveWorkflowArea = item.workflowArea || item.metadata?.workflowArea;
          const effectiveLabel = item.feedbackLabel || item.metadata?.feedbackLabel;
          const effectiveSeverity = item.severity || item.metadata?.severity;
          const scaffold = buildFeedbackRegressionScaffold(item);
          const adminNotes = adminNotesDrafts[item.id] ?? item.adminNotes ?? '';

          return (
            <section key={item.id} className="aurora-panel rounded-[28px] p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {effectiveWorkflowArea ? <Pill>{workflowAreaLabels[effectiveWorkflowArea]}</Pill> : null}
                    {effectiveLabel ? <Pill>{feedbackLabelLabels[effectiveLabel]}</Pill> : null}
                    {effectiveSeverity ? <Pill>{severityLabels[effectiveSeverity]}</Pill> : null}
                    <Pill>{statusLabels[item.status]}</Pill>
                    {item.convertedToRegression ? <Pill>Converted</Pill> : null}
                    {item.phiRiskFlag ? <Pill>PHI warning</Pill> : null}
                  </div>
                  <div className="mt-3 text-lg font-semibold text-white">{item.message}</div>
                  <div className="mt-1 text-sm text-cyan-50/72">
                    {item.pageContext} • {new Date(item.createdAt).toLocaleString()}
                    {item.noteType ? ` • ${item.noteType}` : ''}
                    {item.answerMode ? ` • ${item.answerMode}` : ''}
                    {item.builderFamily ? ` • ${item.builderFamily}` : ''}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void updateItem(item.id, { status: 'reviewed' })} className={actionButtonClass()}>
                    Mark reviewed
                  </button>
                  <button type="button" onClick={() => void updateItem(item.id, { status: 'needs_regression' })} className={actionButtonClass()}>
                    Needs regression
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateItem(item.id, {
                      status: 'converted',
                      convertedToRegression: true,
                      regressionCaseId: item.regressionCaseId || item.id,
                    })}
                    className={actionButtonClass()}
                  >
                    Mark converted
                  </button>
                  <button type="button" onClick={() => void updateItem(item.id, { status: 'dismissed' })} className={actionButtonClass()}>
                    Dismiss
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <DetailCard label="Prompt summary" body={item.promptSummary || item.metadata?.promptSummary || 'No prompt summary captured.'} />
                <DetailCard label="Response summary" body={item.responseSummary || item.metadata?.responseSummary || 'No response summary captured.'} />
                <DetailCard label="What was wrong?" body={item.userComment || item.metadata?.userComment || 'No extra comment added.'} />
                <DetailCard label="What Atlas should have done" body={item.desiredBehavior || item.metadata?.desiredBehavior || 'No expected behavior note added.'} />
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                <label className="grid gap-2 rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.44)] p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/64">Admin notes</span>
                  <textarea
                    value={adminNotes}
                    onChange={(event) => setAdminNotesDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                    className="min-h-[100px] rounded-[14px] border border-cyan-200/12 bg-[rgba(6,15,27,0.72)] px-3 py-2 text-sm text-cyan-50"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void updateItem(item.id, { adminNotes })}
                      className="rounded-[12px] bg-accent px-3 py-2 text-xs font-semibold text-white"
                    >
                      Save notes
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyScaffold(item)}
                      className="rounded-[12px] border border-cyan-200/14 bg-[rgba(8,27,44,0.9)] px-3 py-2 text-xs font-medium text-cyan-50"
                    >
                      Copy regression scaffold
                    </button>
                  </div>
                  {copiedId === item.id ? (
                    <div className="text-[11px] text-emerald-100/86">Regression scaffold copied for manual review.</div>
                  ) : null}
                </label>

                <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.44)] p-4 text-xs text-cyan-50/78">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/64">Regression scaffold preview</div>
                  <pre className="mt-3 whitespace-pre-wrap break-words text-[11px] leading-5 text-cyan-50/72">
                    {JSON.stringify(scaffold, null, 2)}
                  </pre>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="aurora-soft-panel rounded-[22px] p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-cyan-50/72">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-[14px] border border-cyan-200/12 bg-[rgba(8,24,40,0.88)] px-3 py-2 text-sm text-cyan-50"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function Pill({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-cyan-200/14 bg-[rgba(18,181,208,0.12)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
      {children}
    </span>
  );
}

function DetailCard({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.44)] px-4 py-3 text-sm text-cyan-50/82">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/64">{label}</div>
      <div className="mt-2 leading-6">{body}</div>
    </div>
  );
}

function actionButtonClass() {
  return 'rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]';
}
