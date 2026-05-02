import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="mx-auto mt-24 max-w-xl rounded-[var(--radius-lg)] border border-border bg-card p-8 text-center shadow-ig dark:shadow-ig-dark">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">The requested resource does not exist.</p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-8 items-center justify-center rounded-[var(--radius-sm)] bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary-hover))]"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
