import "./globals.css";
import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import { cn } from "@/lib/utils";
import { validateEnv } from "@/lib/env";
import { ThemeScript } from "@/components/theme-script";
import { Toaster } from "@/components/ui/toaster";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap"
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap"
});

export const metadata: Metadata = {
  title: "ReturnSense",
  description: "Scalable return intelligence platform"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  validateEnv();

  return (
    <html
      lang="en"
      className={cn("font-sans", manrope.variable, jetbrains.variable)}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeScript />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
