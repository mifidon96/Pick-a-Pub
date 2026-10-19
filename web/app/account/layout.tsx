import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your account",
  description: "Download or delete your Pick-a-Pub data.",
  robots: { index: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
