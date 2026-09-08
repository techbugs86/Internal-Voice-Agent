import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

/**
 * Google Analytics 4.
 *
 * Read from the environment rather than hardcoded so it stays unset locally —
 * `next dev` traffic would otherwise land in the same property as real
 * visitors. Like every `NEXT_PUBLIC_*` value it is baked into the client bundle
 * at build time, so changing it on Vercel needs a redeploy to take effect.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
  title: "Agent Builder",
  description: "Describe how your voice agent should sound. Get a live agent.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        {GA_ID && (
          <>
            {/*
              `afterInteractive` loads gtag.js once the page is interactive, so
              analytics never delays first paint. The inline block below is
              deliberately not deferred any further: it defines the dataLayer
              queue that gtag.js drains on arrival, so anything recorded before
              the library lands is still sent rather than dropped.
            */}
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
