import { sampleSourceInput } from '@/lib/constants/mock-data';

export function SourcePanel() {
  return (
    <section className="rounded-xl border border-border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Source Input</h2>
      <p className="mt-1 text-sm text-muted">This is the original content used to generate the draft.</p>
      <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-paper p-4 text-sm text-ink">{sampleSourceInput}</pre>
    </section>
  );
}
