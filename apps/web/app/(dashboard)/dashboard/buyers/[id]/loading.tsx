import { Skeleton } from "@/components/ui/skeleton";

export default function BuyerDetailLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-52" />
      </div>
      <div className="space-y-4 lg:col-span-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}
