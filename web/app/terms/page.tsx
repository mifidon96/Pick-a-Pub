import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules for using Pick-a-Pub and posting reviews and photos.",
};

const TERMS_UPDATED = "19 October 2026";

// Plain-English terms. Not legal advice: worth a look by someone qualified before
// the site takes money from pubs.
export default function TermsPage() {
  return (
    <article className="space-y-5 text-sm leading-relaxed">
      <div>
        <h1 className="text-2xl font-bold">Terms of use</h1>
        <p className="text-muted">Last updated {TERMS_UPDATED}</p>
      </div>

      <p>
        Pick-a-Pub helps you find a pub to watch football. By using the site you agree to these terms. If you do not
        agree, please do not use it.
      </p>

      <Section title="Ratings and information">
        <p>
          Ratings come from other fans, and pub details come from OpenStreetMap, the pubs and our own visits. TV
          channels for matches are our best guess. Things change, so check with the pub before you go, especially for
          big games. We are not responsible for a pub not showing a match, being full, or anything else about your visit.
        </p>
        <p>
          &quot;Pick-a-Pub verdicts&quot; are our own opinion. They are kept separate from fan ratings and are never
          paid for.
        </p>
      </Section>

      <Section title="Your reviews and photos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Only review pubs you have actually watched football in, and be honest.</li>
          <li>No abuse, discrimination, threats, spam or adverts.</li>
          <li>No personal details about anyone, and no photos where people can be identified close up.</li>
          <li>Do not post reviews for a pub you own, work at or are paid by, or about a competitor.</li>
          <li>Only upload photos you took yourself.</li>
        </ul>
        <p>
          You keep ownership of what you post. You give us permission to show it on Pick-a-Pub (including in the app
          and in share previews) for as long as it is on the site. You can edit a review by rating the pub again, or
          remove everything from your <Link href="/account/" className="text-pitch underline">Account page</Link>.
        </p>
      </Section>

      <Section title="What we can do">
        <p>
          We can hide or remove reviews and photos that break these rules or that are reported to us, and close
          accounts that keep doing so. Photos are checked before they appear.
        </p>
      </Section>

      <Section title="Using the site">
        <p>
          Do not try to break, overload or scrape the site, or post reviews automatically. The site is provided as it
          is, and we may change or stop it at any time. We may update these terms; the date above shows when.
        </p>
      </Section>

      <Section title="Law and contact">
        <p>These terms are governed by the law of England and Wales.</p>
        {CONTACT_EMAIL && (
          <p>
            Questions: <a href={`mailto:${CONTACT_EMAIL}`} className="text-pitch underline">{CONTACT_EMAIL}</a>.
          </p>
        )}
        <p>
          How we handle your data is explained in the <Link href="/privacy/" className="text-pitch underline">privacy notice</Link>.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
