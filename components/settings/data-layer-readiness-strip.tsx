import Link from 'next/link';
import diagnosisSeed from '@/data/psych-psychiatry-diagnosis.seed.json';
import medicationLibrarySeed from '@/data/psych-medication-library.seed.json';
import medicationWarningSeed from '@/data/psych-medication-warning-rules.seed.json';
import terminologySeed from '@/data/psych-psychiatry-terminology.seed.json';

const infrastructureChips = [
  'Internal infrastructure',
  'Seeded datasets landed',
  'Review-first posture',
  'Library-backed workflow',
];

const dataLayerCards = [
  {
    title: 'Psych terminology',
    count: `${terminologySeed.lexicon.length} lexicon terms`,
    secondary: `${terminologySeed.abbreviations.length} abbreviations`,
    note: 'Feeds abbreviation ambiguity, discouraged-language, risk-language, and MSE review support.',
  },
  {
    title: 'Psych diagnosis',
    count: `${diagnosisSeed.diagnoses.length} diagnosis entries`,
    secondary: `${diagnosisSeed.timeframe_rules.length} timeframe rules`,
    note: 'Feeds family quick picks, timeframe helpers, and diagnosis-caution review checks.',
  },
  {
    title: 'Psych medications',
    count: `${medicationLibrarySeed.medications.length} medication entries`,
    secondary: `${medicationWarningSeed.rules.length} scaffold warning rules`,
    note: 'Feeds medication detection, normalization, and conservative scaffold warning support.',
  },
  {
    title: 'Voice scaffolds',
    count: '2 internal voice lanes',
    secondary: 'Dictation + ambient listening',
    note: 'Both voice lanes are scaffolded as disabled internal infrastructure, not live capture features.',
  },
];

export function DataLayerReadinessStrip() {
  return (
    <section className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-emerald-950">Data layer readiness</div>
          <p className="mt-1 max-w-3xl text-sm text-emerald-900">
            Veranote now has real seeded infrastructure for terminology, diagnosis, medications, and future voice lanes. These layers are there to support safer generation and review, not to pretend the product is finished.
          </p>
        </div>

        <Link
          href="/dashboard/templates"
          className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-950 transition hover:bg-emerald-100"
        >
          Open infrastructure planning
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {infrastructureChips.map((chip) => (
          <span key={chip} className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-950">
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {dataLayerCards.map((card) => (
          <div key={card.title} className="rounded-lg border border-emerald-200 bg-white p-4">
            <div className="text-sm font-semibold text-emerald-950">{card.title}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
                {card.count}
              </span>
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
                {card.secondary}
              </span>
            </div>
            <p className="mt-3 text-sm text-emerald-900">{card.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
