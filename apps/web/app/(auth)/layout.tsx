import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen w-full max-w-[1200px] grid-cols-1 lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between bg-secondary px-10 py-12 text-secondary-foreground lg:flex">
          <div>
            <p className="text-sm font-semibold text-primary">ReturnSense</p>
            <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight">Buyer risk intelligence</h1>
            <p className="mt-3 max-w-md text-sm text-white/75">
              Screen resale conversations, validate contact signals, and ship return decisions with confidence.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center px-4 py-10">{children}</div>
      </div>
    </div>
  );
}
