import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { notFound } from "next/navigation";

import { AddressCard } from "@/components/buyers/address-card";
import { OutcomeMarker } from "@/components/buyers/outcome-marker";
import { PhoneCard } from "@/components/buyers/phone-card";
import { TrustScoreGauge } from "@/components/buyers/trust-score-gauge";
import { Badge } from "@/components/ui/badge";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/server";

function riskBadgeClass(risk: string | null) {
  if (risk === "low") return "bg-emerald-100 text-emerald-700";
  if (risk === "medium") return "bg-yellow-100 text-yellow-700";
  if (risk === "high") return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
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
    <div className="grid gap-6 lg:grid-cols-5">
      <section className="space-y-4 lg:col-span-3">
        <TrustScoreGauge score={buyer.final_trust_score ?? 0} />

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <Badge className={`${riskBadgeClass(buyer.final_risk_level)} capitalize`}>{buyer.final_risk_level ?? "critical"}</Badge>
          <h3 className="mt-4 text-sm font-semibold text-slate-500">AI Analyst Notes</h3>
          <p className="mt-2 italic text-slate-700">{analystNotes}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-500">Positive Signals</h3>
          <div className="flex flex-wrap gap-2">
            {positiveSignals.length
              ? positiveSignals.map((signal: { id: string; signal_name: string }) => (
                  <span key={signal.id} className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">
                    {signal.signal_name}
                  </span>
                ))
              : <p className="text-sm text-slate-500">No positive signals recorded.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-500">Negative Signals</h3>
          <div className="flex flex-wrap gap-2">
            {negativeSignals.length
              ? negativeSignals.map((signal: { id: string; signal_name: string }) => (
                  <span key={signal.id} className="rounded-full bg-red-100 px-3 py-1 text-xs text-red-700">
                    {signal.signal_name}
                  </span>
                ))
              : <p className="text-sm text-slate-500">No negative signals recorded.</p>}
          </div>
        </div>

        <details className="rounded-2xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">All Risk Signals</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Signal</th>
                  <th className="pb-2">Impact</th>
                  <th className="pb-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {(buyer.risk_signals || []).map((signal: { id: string; signal_type: string; signal_name: string; impact: number; description: string }) => (
                  <tr key={signal.id} className="border-t border-slate-100">
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

        <details className="rounded-2xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Chat Transcript</summary>
          <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{buyer.chat_snapshot || "No chat snapshot available."}</pre>
        </details>
      </section>

      <aside className="space-y-4 lg:col-span-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-500">Buyer Info</h3>
          <p className="font-medium">@{buyer.instagram_username}</p>
          <p className="text-sm text-slate-500">Analyzed: {new Date(buyer.created_at).toLocaleString()}</p>
        </div>

        <PhoneCard data={buyer} />
        <AddressCard data={buyer} />

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-500">Historical Record</h3>
          {history?.length ? (
            <p className="text-sm">Found {history.length} outcome record(s) from previous analyses.</p>
          ) : (
            <p className="text-sm text-slate-500">First time buyer — no history</p>
          )}
        </div>

        <OutcomeMarker buyerId={buyer.id} currentOutcome={buyer.outcome} outcomeMarkedAt={buyer.outcome_marked_at} />

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-500">AI Reasons</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {reasons.map((reason: string, index: number) => <li key={index}>{reason}</li>)}
          </ul>
        </div>
      </aside>
    </div>
  );
}
