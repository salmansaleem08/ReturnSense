import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatsCardProps {
  title: string;
  value: string;
  helper?: string;
}

export function StatsCard({ title, value, helper }: StatsCardProps) {
  return (
    <Card className="rs-stats-card rounded-[var(--radius-md)] shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
