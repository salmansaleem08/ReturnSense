import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="mx-auto mt-24 max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-sm">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">The requested resource does not exist.</p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
