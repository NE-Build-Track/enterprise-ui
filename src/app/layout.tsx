import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, Source_Sans_3 } from "next/font/google";

import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const description =
  "Per-actor usage attribution for a livepeer-builder engine: allowance, cost classes, jobs, runners, and reconciliation. Operators issue keys and compare every actor.";

export const metadata: Metadata = {
  title: {
    default: "Livepeer enterprise desk",
    template: "%s — Livepeer enterprise desk",
  },
  description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Livepeer enterprise desk",
  description,
  applicationCategory: "BusinessApplication",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${display.variable} ${sans.variable}`}>
      <body>
        {children}
        <footer>
          <p>
            <small>Livepeer enterprise desk. The engine checks each actor key on every request.</small>
          </p>
        </footer>
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </body>
    </html>
  );
}
