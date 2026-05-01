export function PremiumHero() {
  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: 20,
        padding: "48px",
        background: "linear-gradient(130deg, #ffffff 0%, #f3f8ff 100%)",
        boxShadow: "0 16px 40px rgba(15, 23, 42, 0.08)"
      }}
    >
      <span
        style={{
          display: "inline-block",
          padding: "6px 12px",
          borderRadius: 999,
          fontSize: 12,
          color: "var(--primary)",
          background: "rgba(37, 99, 235, 0.1)",
          fontWeight: 600
        }}
      >
        Production-Ready Foundation
      </span>
      <h1
        style={{
          marginTop: 20,
          marginBottom: 16,
          fontSize: "clamp(32px, 5vw, 52px)",
          lineHeight: 1.05
        }}
      >
        Build ReturnSense with startup-grade confidence.
      </h1>
      <p style={{ color: "var(--muted)", maxWidth: 680, fontSize: 18, lineHeight: 1.6 }}>
        Scalable architecture across web, backend, and a fully isolated Chrome Extension keeps
        engineering velocity high without sacrificing deployment stability or product polish.
      </p>
    </section>
  );
}
