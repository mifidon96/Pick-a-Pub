import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Header from "@/components/Header";
import AppInstall from "@/components/AppInstall";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pick-a-Pub: find a pub for the match",
  description: "Pubs near you, rated for watching football.",
  manifest: "/manifest.json",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Pick-a-Pub", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#14432a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <AuthProvider>
          <Header />
          <AppInstall />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
          <footer className="mx-auto w-full max-w-3xl space-y-2 px-4 py-6 text-xs text-muted">
            <p>
              <Link href="/privacy/" className="underline">Privacy</Link>
            </p>
            <p>Pub locations © OpenStreetMap contributors. Place search by postcodes.io; contains OS data © Crown copyright and database right.</p>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
