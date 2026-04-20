import { sampleDraft } from '@/lib/constants/mock-data';

export function DraftEditor() {
  return (
    <section className="rounded-xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Draft Note</h2>
          <p className="mt-1 text-sm text-muted">Review carefully before use. The draft is editable.</p>
        </div>
        <div className="rounded-full bg-paper px-3 py-1 text-xs font-medium text-muted">Draft output. Clinician review required before use.</div>
      </div>
      <textarea defaultValue={sampleDraft} className="mt-4 min-h-[520px] w-full rounded-lg border border-border p-4" />
    </section>
  );
}
