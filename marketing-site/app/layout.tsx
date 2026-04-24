import type { Metadata } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://veranote.ai';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Veranote',
    template: '%s | Veranote',
  },
  description: 'Clinical note intelligence for providers who need source-faithful drafting, review, and EHR-ready output.',
  openGraph: {
    title: 'Veranote',
    description: 'Clinical note intelligence for providers who need source-faithful drafting, review, and EHR-ready output.',
    url: siteUrl,
    siteName: 'Veranote',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Veranote',
    description: 'Clinical note intelligence for providers who need source-faithful drafting, review, and EHR-ready output.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
