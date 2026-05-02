import { ReactNode } from "react";

/** Minimal layout — pages implement Instagram-style centered cards */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "#FAFAFA" }}>
      {children}
    </div>
  );
}
