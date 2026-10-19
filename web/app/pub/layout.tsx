import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pub",
  description: "Football ratings, details and reviews for this pub.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
