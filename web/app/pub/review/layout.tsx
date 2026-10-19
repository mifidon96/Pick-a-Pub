import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rate this pub",
  description: "Rate this pub for watching football.",
  robots: { index: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
