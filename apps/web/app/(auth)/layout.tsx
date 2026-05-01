import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-5xl items-center justify-center">{children}</div>
    </div>
  );
}
