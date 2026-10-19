import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, PRIVACY_UPDATED } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy", description: "What Pick-a-Pub stores about you, why, and how to download or delete it." };

// Plain-English privacy notice. Keep it in step with what the code actually stores
// (db/schema.sql) and with the account page (download and delete).
export default function PrivacyPage() {
  return (
    <article className="space-y-5 text-sm leading-relaxed">
      <div>
        <h1 className="text-2xl font-bold">Privacy</h1>
        <p className="text-muted">Last updated {PRIVACY_UPDATED}</p>
      </div>

      <p>
        Pick-a-Pub is a small independent site that rates pubs for watching football. This page explains what we
        store about you, why, and how to get it back or delete it.
      </p>

      <Section title="What we store">
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Your email address and password</b>, only if you sign in. These are held by Amazon Cognito, our sign-in service. We never see your password.</li>
          <li><b>The name you choose</b> to show next to your reviews.</li>
          <li><b>Your reviews</b>: scores, comments, the match you watched and when you posted.</li>
          <li><b>Photos you upload</b>. We resize them in your browser first, which also removes location data stored in the photo.</li>
          <li><b>Reports you make</b> about other reviews.</li>
        </ul>
        <p>
          If you just browse, we only count page views, without cookies: which page, which site linked to it, and an
          anonymous code that changes every day so we can tell roughly how many people visited. We never store your IP
          address, cannot follow you from one day to the next, and delete the counts after 90 days. If your browser
          sends &quot;Do Not Track&quot;, we do not count you at all. Your location is only used in your browser to find
          nearby pubs and is not saved. We do not use advertising or tracking cookies, and we do not sell or share your
          data.
        </p>
      </Section>

      <Section title="Why">
        <p>
          We use your email to sign you in and to send sign-in codes. Your reviews and photos are shown publicly,
          under the name you chose, because that is the point of the site. Our legal basis is providing the service
          you signed up for, and our legitimate interest in keeping reviews honest (for example dealing with reports).
        </p>
      </Section>

      <Section title="Where it is kept">
        <p>
          On Amazon Web Services in London (eu-west-2). Your browser keeps your sign-in and your last search in its
          own local storage, which you can clear at any time.
        </p>
      </Section>

      <Section title="How long">
        <p>
          Until you delete your account. Server logs are kept for 14 days. Backups of the database are kept for 7
          days, so deleted data is fully gone within a week.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can see, download, correct or delete your data. Most of this you can do yourself on the{" "}
          <Link href="/account/" className="text-pitch underline">Account page</Link>: download everything we hold
          about you, or delete your account, reviews and photos in one go. You can edit any review by rating the pub
          again.
        </p>
        {CONTACT_EMAIL && (
          <p>
            For anything else, email <a href={`mailto:${CONTACT_EMAIL}`} className="text-pitch underline">{CONTACT_EMAIL}</a>.
          </p>
        )}
        <p>
          If you are unhappy with how we handle your data, you can complain to the Information Commissioner&apos;s
          Office at <a href="https://ico.org.uk/make-a-complaint/" className="text-pitch underline">ico.org.uk</a>.
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
