"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router, supabase]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (signError) setError(signError.message);
    else router.replace("/dashboard");
    setPending(false);
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={{ width: "100%" }}>
      <input
        type="email"
        autoComplete="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={{
          width: "100%",
          background: "#FAFAFA",
          border: "1px solid #DBDBDB",
          borderRadius: "6px",
          padding: "9px 10px",
          fontSize: "14px",
          color: "#262626",
          marginBottom: "8px",
          outline: "none",
          boxSizing: "border-box"
        }}
      />
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        style={{
          width: "100%",
          background: "#FAFAFA",
          border: "1px solid #DBDBDB",
          borderRadius: "6px",
          padding: "9px 10px",
          fontSize: "14px",
          color: "#262626",
          marginBottom: "12px",
          outline: "none",
          boxSizing: "border-box"
        }}
      />
      <button
        type="submit"
        disabled={pending || !email.trim() || !password}
        style={{
          width: "100%",
          background: "#0095F6",
          color: "white",
          border: "none",
          borderRadius: "8px",
          padding: "7px 16px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.7 : 1
        }}
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
      {error ? (
        <p style={{ color: "#ED4956", fontSize: "13px", textAlign: "center", marginTop: "12px" }}>{error}</p>
      ) : null}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FAFAFA",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "10vh",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
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
          width: "100%",
          maxWidth: "350px",
          background: "#FFFFFF",
          border: "1px solid #DBDBDB",
          borderRadius: "4px",
          padding: "40px 40px 24px",
          marginBottom: "10px"
        }}
      >
        <h1
          style={{
            fontSize: "26px",
            fontWeight: 300,
            textAlign: "center",
            marginBottom: "20px",
            color: "#262626"
          }}
        >
          ReturnSense
        </h1>
        <LoginForm />
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: "350px",
          background: "#FFFFFF",
          border: "1px solid #DBDBDB",
          borderRadius: "4px",
          padding: "20px",
          textAlign: "center",
          fontSize: "14px",
          color: "#262626"
        }}
      >
        Don&apos;t have an account?{" "}
        <Link href="/signup" style={{ color: "#0095F6", fontWeight: 600 }}>
          Sign up
        </Link>
      </div>

      <p style={{ marginTop: "20px", fontSize: "13px", color: "#8E8E8E", textAlign: "center", maxWidth: "350px" }}>
        COD fraud prevention for Instagram sellers
      </p>
    </div>
  );
}
