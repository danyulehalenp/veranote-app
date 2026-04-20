import './globals.css';
import type { Metadata } from 'next';
import { Manrope, Space_Grotesk } from 'next/font/google';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Veranote',
  description: 'Turn messy clinical input into a polished, source-faithful note without inventing facts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${spaceGrotesk.variable}`}>{children}</body>
    </html>
  );
}
