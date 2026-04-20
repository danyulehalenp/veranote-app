import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

type ThemeDirection = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  recommendation?: string;
  colors: string[];
  accent: string;
  panel: string;
  textTone: 'light' | 'dark';
  background: string;
  chipStyle: string;
};

const themeDirections: ThemeDirection[] = [
  {
    id: 'clinical-glass',
    name: 'Clinical Glass',
    tagline: 'Icy, premium, precise',
    description: 'Clean and futuristic without feeling cold. This keeps a clinical tone while still looking advanced and expensive.',
    recommendation: 'Safest premium option',
    colors: ['#07111F', '#0E2A47', '#0FA3C8', '#7FE7FF', '#EEF8FF'],
    accent: '#0FA3C8',
    panel: 'rgba(255,255,255,0.14)',
    textTone: 'light',
    background:
      'radial-gradient(circle at top left, rgba(127,231,255,0.28), transparent 26%), radial-gradient(circle at bottom right, rgba(15,163,200,0.20), transparent 32%), linear-gradient(145deg, #07111F 0%, #0C223A 52%, #0F3853 100%)',
    chipStyle: 'border-cyan-200/40 bg-white/10 text-cyan-50',
  },
  {
    id: 'aurora-precision',
    name: 'Aurora Precision',
    tagline: 'Vibrant, high-tech, alive',
    description: 'The strongest balance of energy and professionalism. It feels like premium clinical intelligence instead of ordinary SaaS.',
    recommendation: 'Best overall pick',
    colors: ['#0B1020', '#173B6E', '#12B5D0', '#3BE0B9', '#F2FBFF'],
    accent: '#3BE0B9',
    panel: 'rgba(255,255,255,0.12)',
    textTone: 'light',
    background:
      'radial-gradient(circle at top left, rgba(59,224,185,0.26), transparent 24%), radial-gradient(circle at top right, rgba(18,181,208,0.24), transparent 28%), radial-gradient(circle at bottom center, rgba(73,119,255,0.16), transparent 36%), linear-gradient(150deg, #0B1020 0%, #14335B 48%, #134C67 100%)',
    chipStyle: 'border-emerald-200/40 bg-white/10 text-emerald-50',
  },
  {
    id: 'midnight-signal',
    name: 'Midnight Signal',
    tagline: 'Sharp, elite, command-center',
    description: 'The most dramatic option. It has the strongest ultra-modern feel, but it is also the boldest and least conservative.',
    recommendation: 'Best wow factor',
    colors: ['#050A14', '#10284A', '#2563EB', '#34D5FF', '#EAF4FF'],
    accent: '#34D5FF',
    panel: 'rgba(255,255,255,0.10)',
    textTone: 'light',
    background:
      'radial-gradient(circle at 18% 18%, rgba(52,213,255,0.20), transparent 18%), radial-gradient(circle at 82% 22%, rgba(37,99,235,0.22), transparent 20%), linear-gradient(160deg, #050A14 0%, #0D1B34 45%, #13335A 100%)',
    chipStyle: 'border-sky-200/40 bg-white/10 text-sky-50',
  },
  {
    id: 'luminous-slate',
    name: 'Luminous Slate',
    tagline: 'Elegant, mature, understated',
    description: 'More luxurious and enterprise-like than overtly futuristic. A good fit if you want premium without obvious neon energy.',
    recommendation: 'Best restrained option',
    colors: ['#111A27', '#31465F', '#4E8FB3', '#8ED8E8', '#F5F9FC'],
    accent: '#4E8FB3',
    panel: 'rgba(255,255,255,0.72)',
    textTone: 'dark',
    background:
      'radial-gradient(circle at top left, rgba(142,216,232,0.36), transparent 26%), linear-gradient(150deg, #EAF1F6 0%, #DCE7EF 48%, #CEDAE5 100%)',
    chipStyle: 'border-slate-300 bg-white/80 text-slate-700',
  },
];

function ThemeCard({ theme }: { theme: ThemeDirection }) {
  const lightText = theme.textTone === 'light';

  return (
    <article className="overflow-hidden rounded-[28px] border border-white/80 bg-white/78 p-4 shadow-[0_22px_70px_rgba(21,52,84,0.10)] backdrop-blur-xl">
      <div
        className="rounded-[24px] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
        style={{ background: theme.background, color: lightText ? '#F7FBFF' : '#091728' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">{theme.tagline}</div>
            <h2 className="mt-2 text-3xl font-semibold">{theme.name}</h2>
          </div>
          {theme.recommendation ? (
            <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${theme.chipStyle}`}>
              {theme.recommendation}
            </div>
          ) : null}
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-7 opacity-90">{theme.description}</p>

        <div className="mt-6 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div
            className="rounded-[22px] border p-5 backdrop-blur-sm"
            style={{
              background: theme.panel,
              borderColor: lightText ? 'rgba(255,255,255,0.16)' : 'rgba(9,23,40,0.08)',
            }}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.16em] opacity-75">Workspace preview</div>
            <div className="mt-4 grid gap-3">
              <div
                className="rounded-[18px] p-4"
                style={{
                  background: lightText ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.76)',
                  border: lightText ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(9,23,40,0.08)',
                }}
              >
                <div className="text-sm font-semibold">Provider workspace</div>
                <p className="mt-2 text-sm opacity-80">Compose, review, and finish in one premium clinical note flow.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="rounded-[18px] p-4"
                  style={{
                    background: lightText ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',
                    border: lightText ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(9,23,40,0.08)',
                  }}
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] opacity-75">Compose</div>
                  <div className="mt-2 text-sm font-medium">Source-first</div>
                </div>
                <div
                  className="rounded-[18px] p-4"
                  style={{
                    background: lightText ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',
                    border: lightText ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(9,23,40,0.08)',
                  }}
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] opacity-75">Review</div>
                  <div className="mt-2 text-sm font-medium">Trust-first</div>
                </div>
              </div>
            </div>
          </div>

          <div
            className="rounded-[22px] border p-5 backdrop-blur-sm"
            style={{
              background: theme.panel,
              borderColor: lightText ? 'rgba(255,255,255,0.16)' : 'rgba(9,23,40,0.08)',
            }}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.16em] opacity-75">Palette</div>
            <div className="mt-4 grid grid-cols-5 gap-3">
              {theme.colors.map((color) => (
                <div key={color}>
                  <div className="h-16 rounded-2xl border border-white/20 shadow-sm" style={{ backgroundColor: color }} />
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] opacity-75">{color}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div
                className="rounded-[18px] p-4"
                style={{
                  background: lightText ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',
                  border: lightText ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(9,23,40,0.08)',
                }}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.14em] opacity-75">Accent</div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl border border-white/20" style={{ backgroundColor: theme.accent }} />
                  <div className="text-sm font-medium">{theme.accent}</div>
                </div>
              </div>
              <div
                className="rounded-[18px] p-4"
                style={{
                  background: lightText ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',
                  border: lightText ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(9,23,40,0.08)',
                }}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.14em] opacity-75">Panel feel</div>
                <div className="mt-3 rounded-2xl border border-white/15 p-4" style={{ background: theme.panel }}>
                  Glass / premium card surface
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function ThemePreviewPage() {
  if (!INTERNAL_MODE_ENABLED) {
    redirect('/');
  }

  return (
    <AppShell
      title="Theme Preview"
      subtitle="Four stronger Veranote color and background directions shown side by side. This is a visual decision page so we can react to actual mood, depth, and polish instead of just hex codes."
    >
      <div className="mb-8 rounded-[24px] border border-cyan-200 bg-cyan-50/80 p-6 text-sm text-cyan-950 shadow-[0_18px_60px_rgba(21,52,84,0.08)]">
        <div className="font-semibold">How to read this page</div>
        <p className="mt-2 leading-7">
          Focus on the overall mood first: does it feel clinical, premium, modern, and trustworthy? Then decide how bold you want Veranote to be. My current recommendation is <span className="font-semibold">Aurora Precision</span> if you want the strongest balance of vibrancy and professionalism.
        </p>
      </div>

      <div className="grid gap-8">
        {themeDirections.map((theme) => (
          <ThemeCard key={theme.id} theme={theme} />
        ))}
      </div>
    </AppShell>
  );
}
