"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [cooldown, setCooldown] = useState(0);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router, supabase]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function resend() {
    if (!email.trim() || cooldown > 0 || pending) return;
    setPending(true);
    setMsg(null);
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    if (error) setMsg(error.message);
    else {
      setMsg("Confirmation email sent.");
      setCooldown(60);
    }
    setPending(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FAFAFA",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "12vh",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        paddingLeft: "16px",
        paddingRight: "16px"
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          background: "#262626",
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: 700,
          fontSize: "22px",
          fontFamily: "Georgia, serif",
          marginBottom: "20px"
        }}
      >
        R
      </div>
      <div
        style={{
          maxWidth: "400px",
          background: "#fff",
          border: "1px solid #DBDBDB",
          borderRadius: "4px",
          padding: "28px 24px",
          textAlign: "center"
        }}
      >
        <h1 style={{ fontSize: "18px", fontWeight: 600, color: "#262626", marginBottom: "12px" }}>Check your email</h1>
        <p style={{ fontSize: "14px", color: "#737373", lineHeight: 1.5 }}>
          We sent a link to <strong style={{ color: "#262626" }}>{email || "your email"}</strong>. Click it to activate your
          account.
        </p>
        <button
          type="button"
          disabled={!email.trim() || cooldown > 0 || pending}
          onClick={() => void resend()}
          style={{
            marginTop: "18px",
            width: "100%",
            background: cooldown > 0 ? "#EFEFEF" : "#0095F6",
            color: cooldown > 0 ? "#737373" : "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "8px",
            fontWeight: 600,
            fontSize: "14px",
            cursor: cooldown > 0 ? "not-allowed" : "pointer"
          }}
        >
          {pending ? "Sending…" : cooldown > 0 ? `Resend email (${cooldown}s)` : "Resend email"}
        </button>
        {msg ? <p style={{ marginTop: "12px", fontSize: "13px", color: "#262626" }}>{msg}</p> : null}
        <p style={{ marginTop: "16px", fontSize: "13px" }}>
          <Link href="/login" style={{ color: "#0095F6", fontWeight: 600 }}>
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", background: "#FAFAFA", padding: "40px", textAlign: "center" }}>Loading…</div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
