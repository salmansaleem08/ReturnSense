import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { validateEnv } from "@/lib/env";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "ReturnSense",
  description: "Scalable return intelligence platform"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  validateEnv();

  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
