import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { notFound } from "next/navigation";

import { AddressCard } from "@/components/buyers/address-card";
import { OutcomeMarker } from "@/components/buyers/outcome-marker";
import { PhoneCard } from "@/components/buyers/phone-card";
import { ShareLinkButton } from "@/components/buyers/share-link-button";
import { TrustScoreGauge } from "@/components/buyers/trust-score-gauge";
import { Badge } from "@/components/ui/badge";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/server";

function riskBadgeClass(risk: string | null) {
  if (risk === "low") return "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (risk === "medium") return "border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-400";
  if (risk === "high") return "border border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-400";
  return "border border-destructive/30 bg-destructive/10 text-destructive";
}

export default async function BuyerDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublicKey(), {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} }
  });
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: buyer } = await supabaseAdmin
    .from("buyers")
    .select("*,risk_signals(*)")
    .eq("id", params.id)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (!buyer) notFound();

  const { data: history } = await supabaseAdmin
    .from("buyers")
    .select("outcome")
    .neq("id", buyer.id)
    .or(`phone_number.eq.${buyer.phone_number},instagram_username.eq.${buyer.instagram_username}`)
    .not("outcome", "eq", "pending");

  const positiveSignals = (buyer.risk_signals || []).filter((signal: { impact: number }) => signal.impact > 0);
  const negativeSignals = (buyer.risk_signals || []).filter((signal: { impact: number }) => signal.impact < 0);
  const reasons = Array.isArray(buyer.ai_reasons) ? buyer.ai_reasons : [];
  const analystNotes = buyer.ai_raw_response?.analyst_notes || "No analyst notes available.";

  return (
    <div className="grid w-full max-w-[min(1600px,100%)] gap-6 lg:grid-cols-5 motion-safe:animate-[rs-fade-in_0.4s_ease-out]">
      <section className="space-y-4 lg:col-span-3 lg:pr-2">
        <TrustScoreGauge score={buyer.final_trust_score ?? 0} />

        <div className="rounded-[var(--radius-md)] border border-border bg-card p-5 shadow-none">
          <Badge className={`${riskBadgeClass(buyer.final_risk_level)} px-3 py-1 text-xs font-semibold capitalize`}>
            {buyer.final_risk_level ?? "critical"}
          </Badge>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI notes</h3>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{analystNotes}</p>
        </div>

        <div className="rounded-[var(--radius-md)] border border-border bg-card p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Positive signals</h3>
          <div className="flex flex-wrap gap-2">
            {positiveSignals.length
              ? positiveSignals.map((signal: { id: string; signal_name: string }) => (
                  <span key={signal.id} className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">
                    {signal.signal_name}
                  </span>
                ))
              : <p className="text-sm text-muted-foreground">No positive signals recorded.</p>}
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] border border-border bg-card p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Negative signals</h3>
          <div className="flex flex-wrap gap-2">
            {negativeSignals.length
              ? negativeSignals.map((signal: { id: string; signal_name: string }) => (
                  <span key={signal.id} className="rounded-full bg-red-100 px-3 py-1 text-xs text-red-700">
                    {signal.signal_name}
                  </span>
                ))
              : <p className="text-sm text-muted-foreground">No negative signals recorded.</p>}
          </div>
        </div>

        <details className="rounded-[var(--radius-md)] border border-border bg-card p-5">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">All risk signals</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Signal</th>
                  <th className="pb-2">Impact</th>
                  <th className="pb-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {(buyer.risk_signals || []).map((signal: { id: string; signal_type: string; signal_name: string; impact: number; description: string }) => (
                  <tr key={signal.id} className="border-t border-border">
                    <td className="py-2 capitalize">{signal.signal_type}</td>
                    <td className="py-2">{signal.signal_name}</td>
                    <td className={`py-2 font-medium ${signal.impact > 0 ? "text-emerald-600" : "text-red-600"}`}>{signal.impact}</td>
                    <td className="py-2">{signal.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="rounded-[var(--radius-md)] border border-border bg-card p-5">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">Chat transcript</summary>
          <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-muted/50 p-4 text-sm leading-relaxed text-foreground">
            {buyer.chat_snapshot || "No chat snapshot available."}
          </pre>
        </details>
      </section>

      <aside className="space-y-4 lg:col-span-2">
        <ShareLinkButton />

        <div className="rounded-[var(--radius-md)] border border-border bg-card p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Buyer</h3>
          <p className="text-lg font-semibold text-foreground">@{buyer.instagram_username}</p>
          <p className="mt-1 text-sm text-muted-foreground">Analyzed {new Date(buyer.created_at).toLocaleString()}</p>
        </div>

        <PhoneCard data={buyer} />
        <AddressCard data={buyer} />

        <div className="rounded-[var(--radius-md)] border border-border bg-card p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h3>
          {history?.length ? (
            <p className="text-sm text-foreground">Found {history.length} outcome record(s) from previous analyses.</p>
          ) : (
            <p className="text-sm text-muted-foreground">First-time buyer — no prior outcomes.</p>
          )}
        </div>

        <OutcomeMarker buyerId={buyer.id} currentOutcome={buyer.outcome} outcomeMarkedAt={buyer.outcome_marked_at} />

        <div className="rounded-[var(--radius-md)] border border-border bg-card p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI reasons</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground">
            {reasons.map((reason: string, index: number) => <li key={index}>{reason}</li>)}
          </ul>
        </div>
      </aside>
    </div>
  );
}
