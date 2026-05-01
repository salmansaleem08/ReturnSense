import "./globals.css";
import type { Metadata } from "next";
import { AppShell } from "../components/app-shell";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "ReturnSense",
  description: "Scalable return intelligence platform"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
