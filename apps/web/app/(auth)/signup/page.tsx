"use client";

import type { CSSProperties } from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const USERNAME_RE = /^[\w.]{3,30}$/;

function inputStyle(): CSSProperties {
  return {
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
  };
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router, supabase]);

  const usernameOk = USERNAME_RE.test(username.toLowerCase());
  const formValid =
    fullName.trim().length >= 1 && usernameOk && email.includes("@") && password.length >= 8;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formValid) return;
    setPending(true);
    setError(null);
    const origin =
      typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL ?? "";
    const userLower = username.trim().toLowerCase();
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim(), username: userLower },
        emailRedirectTo: `${origin}/auth/callback?next=/dashboard`
      }
    });
    if (signUpError) {
      setError(signUpError.message);
      setPending(false);
      return;
    }
    router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`);
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
        paddingTop: "8vh",
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
          padding: "36px 36px 20px",
          marginBottom: "10px"
        }}
      >
        <h1 style={{ fontSize: "22px", fontWeight: 600, textAlign: "center", marginBottom: "18px", color: "#262626" }}>
          Sign up
        </h1>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <input
            style={inputStyle()}
            type="text"
            placeholder="Full Name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <input
            style={inputStyle()}
            type="text"
            placeholder="Username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            required
          />
          <input
            style={inputStyle()}
            type="email"
            placeholder="Email address"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={inputStyle()}
            type="password"
            placeholder="Password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <button
            type="submit"
            disabled={pending || !formValid}
            style={{
              width: "100%",
              background: "#0095F6",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: pending ? "wait" : "pointer",
              opacity: pending || !formValid ? 0.45 : 1,
              marginTop: "6px"
            }}
          >
            {pending ? "Signing up…" : "Sign up"}
          </button>
          {error ? (
            <p style={{ color: "#ED4956", fontSize: "13px", textAlign: "center", marginTop: "12px" }}>{error}</p>
          ) : null}
          <p style={{ fontSize: "11px", color: "#8E8E8E", marginTop: "12px", textAlign: "center", lineHeight: 1.4 }}>
            Username: letters, numbers, underscores, dots — 3–30 characters.
          </p>
        </form>
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
        Have an account?{" "}
        <Link href="/login" style={{ color: "#0095F6", fontWeight: 600 }}>
          Log in
        </Link>
      </div>
    </div>
  );
}
