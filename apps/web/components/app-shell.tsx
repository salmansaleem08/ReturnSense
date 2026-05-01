import { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "32px",
        display: "flex",
        justifyContent: "center"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1120px"
        }}
      >
        {children}
      </div>
    </main>
  );
}
