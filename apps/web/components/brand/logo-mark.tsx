import { cn } from "@/lib/utils";

const DIM = { 24: 24, 28: 28, 32: 32, 40: 40, 48: 48 } as const;

type Size = keyof typeof DIM;

/** Same artwork as `public/shopping-bag.png` (extension: `icons/shopping-bag.png`). */
export function LogoMark({ size = 32, className }: { size?: Size; className?: string }) {
  const px = DIM[size] ?? 32;
  return (
    <img
      src="/shopping-bag.png"
      alt=""
      width={px}
      height={px}
      className={cn("shrink-0 select-none", className)}
      draggable={false}
    />
  );
}

export function LogoWordmark({ className }: { className?: string }) {
  return <span className={cn("font-semibold tracking-tight text-foreground", className)}>ReturnSense</span>;
}
