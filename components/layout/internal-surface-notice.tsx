import Link from 'next/link';

export function InternalSurfaceNotice({
  title = 'Internal tool, not provider workflow',
  body,
}: {
  title?: string;
  body: string;
}) {
  return (
    <section className="aurora-soft-panel mb-6 flex flex-col gap-3 rounded-[24px] border border-rose-200/16 p-5 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-100">Internal only</div>
        <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-rose-50/84">{body}</p>
      </div>
      <Link
        href="/dashboard/internal"
        className="inline-flex rounded-xl border border-rose-200/24 bg-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-semibold text-rose-50 transition hover:border-rose-200/36 hover:bg-[rgba(255,255,255,0.14)]"
      >
        Back to internal workbench
      </Link>
    </section>
  );
}
