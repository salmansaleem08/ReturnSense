import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="mx-auto mt-24 max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <p className="text-sm font-semibold text-slate-500">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">The requested resource does not exist.</p>
      <Link href="/dashboard" className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
        Back to dashboard
      </Link>
    </div>
  );
}
