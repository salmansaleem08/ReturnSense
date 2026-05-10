import Link from "next/link";

import { LogoMark, LogoWordmark } from "@/components/brand/logo-mark";
import { ThemeToggle } from "@/components/theme-toggle";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6 py-4 md:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <LogoWordmark />
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="#how" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <a href="#pricing" className="transition-colors hover:text-foreground">
            Plans
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden h-9 items-center rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
