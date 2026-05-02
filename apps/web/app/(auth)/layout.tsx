import { ReactNode } from "react";

/** Auth pages supply their own full layout (gradient + split panels). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
