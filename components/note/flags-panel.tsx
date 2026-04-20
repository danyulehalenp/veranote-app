import { exampleFlags } from '@/lib/constants/mock-data';

export function FlagsPanel() {
  return (
    <section style={{ backgroundColor: '#2563eb', color: 'white', border: '4px solid yellow' }} className="rounded-xl border-border p-5 shadow-sm">
  <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '16px' }}>LIVE FLAGS FILE</h1>
      <h2 className="text-lg font-semibold">Missing / Unclear Items</h2>
      <p className="mt-1 text-sm text-muted">These are prompts for review, not completed documentation.</p>
      <ul className="mt-4 space-y-3 text-sm text-ink">
        {exampleFlags.map((flag) => (
          <li key={flag} className="rounded-lg bg-paper p-3">{flag}</li>
        ))}
      </ul>
      <div className="mt-6 border-t border-border pt-4">
        <h3 className="font-medium">Rewrite Tools</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {['More concise', 'More formal', 'Closer to source', 'Regenerate section', 'Regenerate full note'].map((label) => (
            <button key={label} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">{label}</button>
          ))}
        </div>
      </div>
    </section>
  );
}
