import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Pick-a-Pub: find a pub for the match",
  description: "Pubs near you, rated for watching football.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <AuthProvider>
          <Header />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
          <footer className="mx-auto w-full max-w-3xl px-4 py-6 text-xs text-muted">
            Pub locations © OpenStreetMap contributors.
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
