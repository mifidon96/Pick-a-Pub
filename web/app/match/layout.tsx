import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Where's it showing?",
  description: "Upcoming Premier League, Championship and Champions League matches, and the nearby pubs showing them.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
