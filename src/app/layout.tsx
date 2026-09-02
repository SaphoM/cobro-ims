import type { Metadata } from 'next';
import { Unbounded, Manrope, JetBrains_Mono } from 'next/font/google';
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme';
import './globals.css';

const unbounded = Unbounded({
  variable: '--font-unbounded',
  subsets: ['latin'],
  weight: ['300', '500', '800'],
});

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const jbmono = JetBrains_Mono({
  variable: '--font-jbmono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Cobro IMS',
  description: "Cobro's inventory management system - built by X Spark.",
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning: the bootstrap script below sets data-theme on
    // <html> before React hydrates, so the client's markup deliberately differs
    // from the server's here. It's scoped to this element only.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${unbounded.variable} ${manrope.variable} ${jbmono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Applies the saved theme before the first paint. It has to be inline
          and parser-blocking — an external or deferred script would let the
          dark default paint first and flash at every light-mode user.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-text">{children}</body>
    </html>
  );
}
