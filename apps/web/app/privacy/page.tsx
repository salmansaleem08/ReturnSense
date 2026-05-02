import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | ReturnSense"
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12 text-sm leading-relaxed text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="text-muted-foreground">Last updated: 2 May 2026</p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">What we collect</h2>
        <p>
          When you use ReturnSense, we process account data (e.g. email for login), analysis metadata you generate (trust scores, risk
          signals, phone/address validation results you submit in the tool), and optional order outcomes you mark (delivered, returned,
          fake, cancelled). Cross-seller network features use one-way hashes of Instagram usernames and phone numbers only—never plaintext
          in shared tables.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">What we do not store</h2>
        <p>We do not store raw Instagram DM or chat transcript text in our database. Text is analyzed to extract signals, then discarded.</p>
        <p>We do not store full delivery addresses in any shared network table.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">How we use data</h2>
        <p>
          Scores and signals are advisory to help you assess COD risk. ReturnSense does not block, reject, or act on buyers automatically—you
          make the final business decision. Network intelligence uses aggregate outcome statistics linked to hashed identifiers to protect
          privacy.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Your rights</h2>
        <p>
          You may request deletion of your account and associated personal data by contacting support through the contact method published
          on this site. Some anonymized or hashed aggregates may be retained where required for fraud-prevention integrity.
        </p>
      </section>

      <p className="pt-4 text-muted-foreground">
        <Link href="/" className="underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}
