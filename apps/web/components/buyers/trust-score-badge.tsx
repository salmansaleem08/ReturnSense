import { Badge } from "@/components/ui/badge";

export function TrustScoreBadge({ score }: { score: number | null }) {
  const value = score ?? 0;
  const classes =
    value >= 75
      ? "bg-emerald-100 text-emerald-800"
      : value >= 55
        ? "bg-yellow-100 text-yellow-800"
        : value >= 35
          ? "bg-orange-100 text-orange-800"
          : "bg-red-100 text-red-800";

  return <Badge className={classes}>{value}</Badge>;
}
