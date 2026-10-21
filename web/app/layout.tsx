import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Header from "@/components/Header";
import AppInstall from "@/components/AppInstall";
import PageCount from "@/components/PageCount";
import Link from "next/link";
import Script from "next/script";

// The live address, so share previews get full URLs. Release builds use a
// placeholder here (scripts/build-release.sh) that deploy.sh swaps for each
// environment's address, so one build serves dev and prod.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const DESCRIPTION = "Find a pub to watch the match. Pubs near you rated by football fans on the view of the screen, sound, crowd and seats.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Pick-a-Pub: find a pub for the match", template: "%s | Pick-a-Pub" },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Pick-a-Pub",
    title: "Pick-a-Pub: find a pub for the match",
    description: DESCRIPTION,
    locale: "en_GB",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Pick-a-Pub: where to watch the match, rated by football fans" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
  manifest: "/manifest.json",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Pick-a-Pub", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#14432a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        {/* This environment's settings (API address, sign-in). Loads before the app. */}
        <Script src="/config.js" strategy="beforeInteractive" />
        <AuthProvider>
          <Header />
          <AppInstall />
          <PageCount />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
          <footer className="mx-auto w-full max-w-3xl space-y-2 px-4 py-6 text-xs text-muted">
            <p className="flex gap-4">
              <Link href="/privacy/" className="underline">Privacy</Link>
              <Link href="/terms/" className="underline">Terms</Link>
            </p>
            <p>Pub locations © OpenStreetMap contributors. Place search by postcodes.io; contains OS data © Crown copyright and database right.</p>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
