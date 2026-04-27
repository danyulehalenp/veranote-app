'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { BrandLockup } from '@/components/veranote/BrandLockup';
import { normalizeSafeCallbackPath } from '@/lib/veranote/auth-redirect';
import { getMarketingSiteUrl } from '@/lib/veranote/domain-config';

const marketingSiteUrl = getMarketingSiteUrl();

function SignInCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = normalizeSafeCallbackPath(searchParams.get('callbackUrl'));
  const { status } = useSession();
  const [email, setEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(callbackUrl);
    }
  }, [callbackUrl, router, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await signIn('credentials', {
        email,
        accessCode,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError('Email or beta access code was not recognized.');
        return;
      }

      router.replace(normalizeSafeCallbackPath(result?.url, callbackUrl));
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="workspace-command-bar workspace-shine w-full max-w-5xl rounded-[34px] p-3 sm:p-4">
      <div className="workspace-shell workspace-grid overflow-hidden rounded-[30px] p-[1px]">
        <div className="grid gap-0 rounded-[29px] bg-[linear-gradient(180deg,rgba(7,18,32,0.96),rgba(4,12,24,0.94))] lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <div className="flex flex-col justify-between gap-8 p-8 sm:p-10">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/62">Veranote access</div>
              <div className="mt-5">
                <BrandLockup variant="hero" />
              </div>
              <h1 className="mt-8 max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                A sharper provider workspace for source-first clinical documentation.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-cyan-50/76 sm:text-[15px]">
                Review, evidence, rewriting, and export now live inside a more intentional Veranote surface designed to feel closer to a modern clinical command console than a generic form flow.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="workspace-card-static rounded-[22px] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/62">Source first</div>
                <div className="mt-2 text-lg font-semibold text-white">Capture stays visible</div>
                <p className="mt-2 text-sm text-cyan-50/68">Providers can verify against source instead of jumping between disconnected screens.</p>
              </div>
              <div className="workspace-card-static rounded-[22px] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/62">Trust review</div>
                <div className="mt-2 text-lg font-semibold text-white">Evidence stays close</div>
                <p className="mt-2 text-sm text-cyan-50/68">Warnings, review status, and finishing actions stay structured around fidelity.</p>
              </div>
              <div className="workspace-card-static rounded-[22px] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/62">Provider memory</div>
                <div className="mt-2 text-lg font-semibold text-white">Learns your workflow</div>
                <p className="mt-2 text-sm text-cyan-50/68">Atlas is moving toward a remembered, provider-specific assistant instead of a reset-every-time tool.</p>
              </div>
            </div>
          </div>

          <div className="border-t border-white/8 bg-[linear-gradient(180deg,rgba(10,24,40,0.94),rgba(7,17,29,0.94))] p-8 sm:p-10 lg:border-l lg:border-t-0 lg:border-l-white/8">
            <div className="mb-8">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/62">Provider beta sign in</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">Open your workspace</h2>
              <p className="mt-3 text-sm leading-7 text-cyan-50/78">
                Sign in with your invited beta email and access code to open your Veranote workspace.
              </p>
              <p className="mt-3 text-xs leading-6 text-cyan-50/58">
                Looking for the public site? <a href={marketingSiteUrl} className="font-semibold text-cyan-100 underline decoration-cyan-200/30 underline-offset-4">{marketingSiteUrl.replace(/^https?:\/\//, '')}</a>
              </p>
            </div>

            <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-cyan-50">Email</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                  className="workspace-control w-full rounded-2xl px-4 py-3"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-cyan-50">Beta access code</span>
                <input
                  value={accessCode}
                  onChange={(event) => setAccessCode(event.target.value)}
                  type="password"
                  autoComplete="current-password"
                  required
                  className="workspace-control w-full rounded-2xl px-4 py-3"
                />
              </label>

              {error ? (
                <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-2xl bg-[linear-gradient(135deg,#d8fbff_0%,#bff4ff_44%,#8ae8ff_100%)] px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_42px_rgba(100,220,255,0.22)] transition hover:-translate-y-[1px] hover:shadow-[0_22px_54px_rgba(100,220,255,0.28)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? 'Signing in...' : 'Sign in to Veranote'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function SignInPage() {
  return (
    <main className="veranote-theme flex min-h-screen w-full items-start justify-center overflow-y-auto px-4 py-6 sm:px-6 sm:py-10 lg:items-center lg:py-12">
      <Suspense
        fallback={(
          <section className="workspace-command-bar w-full max-w-2xl rounded-[30px] p-8 shadow-[0_28px_90px_rgba(4,12,24,0.34)]">
            <BrandLockup variant="hero" />
            <h1 className="mt-6 text-3xl font-semibold text-white">Provider beta sign in</h1>
            <p className="mt-3 text-sm leading-7 text-cyan-50/82">Loading secure sign in…</p>
          </section>
        )}
      >
        <SignInCard />
      </Suspense>
    </main>
  );
}
