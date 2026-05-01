import { PremiumHero } from "../components/premium-hero";

export default function HomePage() {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <PremiumHero />
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 20,
          background: "var(--surface)",
          padding: 24
        }}
      >
        <h2 style={{ marginTop: 0 }}>Platform Readiness</h2>
        <p style={{ color: "var(--muted)" }}>
          This baseline is intentionally lean and deployment-safe so product teams can implement
          features in parallel without architecture rewrites.
        </p>
      </section>
    </div>
  );
}
