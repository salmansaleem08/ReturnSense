import Link from "next/link";

import { PageAmbientBg } from "@/components/layout/page-ambient";
import { PublicHeader } from "@/components/marketing/public-header";

export const metadata = {
  title: "Privacy Policy | ReturnSense"
};

export default function PrivacyPage() {
  return (
    <div className="rs-page-ambient min-h-screen bg-background">
      <PageAmbientBg />
      <div className="relative z-10">
        <PublicHeader />
        <article className="mx-auto max-w-2xl space-y-6 px-4 py-14 text-sm leading-relaxed text-foreground md:py-20">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            <span className="rs-text-gradient">Privacy policy</span>
          </h1>
          <p className="text-muted-foreground">Last updated: 2 May 2026</p>

          <section className="rs-card-elevated space-y-2 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-foreground">What we collect</h2>
            <p className="text-muted-foreground">
              When you use ReturnSense, we process account data (e.g. email for login), analysis metadata you generate (trust scores, risk
              signals, phone/address validation results you submit in the tool), and optional order outcomes you mark (delivered, returned,
              fake, cancelled). Cross-seller network features use one-way hashes of Instagram usernames and phone numbers only—never plaintext
              in shared tables.
            </p>
          </section>

          <section className="rs-card-elevated space-y-2 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-foreground">What we do not store</h2>
            <p className="text-muted-foreground">
              We do not store raw Instagram DM or chat transcript text in our database. Text is analyzed to extract signals, then discarded.
            </p>
            <p className="text-muted-foreground">We do not store full delivery addresses in any shared network table.</p>
          </section>

          <section className="rs-card-elevated space-y-2 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-foreground">How we use data</h2>
            <p className="text-muted-foreground">
              Scores and signals are advisory to help you assess COD risk. ReturnSense does not block, reject, or act on buyers automatically—you
              make the final business decision. Network intelligence uses aggregate outcome statistics linked to hashed identifiers to protect
              privacy.
            </p>
          </section>

          <section className="rs-card-elevated space-y-2 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-foreground">Your rights</h2>
            <p className="text-muted-foreground">
              You may request deletion of your account and associated personal data by contacting support through the contact method published
              on this site. Some anonymized or hashed aggregates may be retained where required for fraud-prevention integrity.
            </p>
          </section>

          <p className="pt-2">
            <Link href="/" className="font-semibold text-primary hover:underline">
              Back to home
            </Link>
          </p>
        </article>
      </div>
    </div>
  );
}
