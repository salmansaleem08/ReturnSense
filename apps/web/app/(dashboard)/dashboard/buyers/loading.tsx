import { Skeleton } from "@/components/ui/skeleton";

export default function BuyersLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20" />
      <Skeleton className="h-[420px]" />
    </div>
  );
}
