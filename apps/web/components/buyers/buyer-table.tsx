"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteAnalysisButton } from "@/components/buyers/delete-analysis-button";
import { TrustScoreBadge } from "@/components/buyers/trust-score-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface BuyerRow {
  id: string;
  instagram_username: string;
  final_trust_score: number | null;
  final_risk_level: string | null;
  phone_number: string | null;
  phone_valid: boolean | null;
  address_city: string | null;
  address_quality_score: number | null;
  created_at: string;
  outcome: string;
}

function outcomeClass(outcome: string) {
  if (outcome === "delivered") return "bg-emerald-100 text-emerald-800";
  if (outcome === "returned") return "bg-red-100 text-red-800";
  if (outcome === "fake") return "bg-slate-900 text-white";
  return "bg-slate-100 text-slate-700";
}

export function BuyerTable({
  items,
  page,
  limit,
  total
}: {
  items: BuyerRow[];
  page: number;
  limit: number;
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / limit));

  function gotoPage(nextPage: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("page", String(nextPage));
    router.push(`/dashboard/buyers?${next.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Buyer</TableHead>
              <TableHead>Trust Score</TableHead>
              <TableHead>Risk Level</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length ? (
              items.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/dashboard/buyers/${item.id}`)}
                >
                  <TableCell className="font-medium">@{item.instagram_username}</TableCell>
                  <TableCell>
                    <TrustScoreBadge score={item.final_trust_score} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {item.final_risk_level ?? "unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${item.phone_valid ? "bg-emerald-500" : "bg-red-500"}`}
                      />
                      <span>{item.phone_number ?? "N/A"}</span>
                    </div>
                  </TableCell>
                  <TableCell>{item.address_city ?? "Unknown"} ({item.address_quality_score ?? 0})</TableCell>
                  <TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge className={`${outcomeClass(item.outcome)} capitalize`}>{item.outcome}</Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DeleteAnalysisButton buyerId={item.id} compact stopPropagation />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-slate-500">
                  No buyers analyzed yet. Use the Chrome Extension on Instagram.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={page <= 1} onClick={() => gotoPage(page - 1)}>
          Prev
        </Button>
        <p className="text-sm text-slate-600">
          Page {page} of {totalPages}
        </p>
        <Button variant="outline" disabled={page >= totalPages} onClick={() => gotoPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
