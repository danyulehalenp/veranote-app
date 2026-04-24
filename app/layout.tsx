import './globals.css';
import type { Metadata } from 'next';
import { Manrope, Space_Grotesk } from 'next/font/google';
import { AuthSessionProvider } from '@/components/auth/session-provider';
import { AuthSessionSync } from '@/components/auth/auth-session-sync';
import { getAppBaseUrl, getMarketingSiteUrl, getMetadataBase } from '@/lib/veranote/domain-config';
import { assertSafeBetaRuntimeConfig } from '@/lib/veranote/runtime-config';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: 'Veranote',
    template: '%s | Veranote',
  },
  description: 'Turn messy clinical input into a polished, source-faithful note without inventing facts.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Veranote',
    description: 'Turn messy clinical input into a polished, source-faithful note without inventing facts.',
    url: getMarketingSiteUrl(),
    siteName: 'Veranote',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Veranote',
    description: 'Turn messy clinical input into a polished, source-faithful note without inventing facts.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  assertSafeBetaRuntimeConfig();
  const appBaseUrl = getAppBaseUrl();

  return (
    <html lang="en">
      <body className={`${manrope.variable} ${spaceGrotesk.variable}`}>
        <AuthSessionProvider>
          <AuthSessionSync key={appBaseUrl} />
          {children}
        </AuthSessionProvider>
      </body>
    </html>
  );
}
