interface AddressData {
  address_raw?: string | null;
  address_formatted?: string | null;
  address_city?: string | null;
  address_province?: string | null;
  address_country?: string | null;
  address_quality_score?: number | null;
  address_precision?: string | null;
  address_lat?: number | null;
  address_lng?: number | null;
}

export function AddressCard({ data }: { data: AddressData }) {
  const raw = data.address_raw?.trim?.() ?? "";
  const hasInput = Boolean(raw);
  const geocoded =
    data.address_lat != null &&
    data.address_lng != null &&
    Boolean(data.address_formatted || data.address_city);

  const quality = data.address_quality_score ?? 0;
  const qualityColor =
    quality >= 75 ? "bg-primary" : quality >= 45 ? "bg-amber-500" : "bg-destructive";

  const mapUrl =
    data.address_lat != null && data.address_lng != null
      ? `https://www.google.com/maps?q=${data.address_lat},${data.address_lng}&z=15&output=embed`
      : null;

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card p-4 shadow-none">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Address analysis</h3>
      <div className="space-y-2 text-sm leading-[18px]">
        {!hasInput ? (
          <p className="text-muted-foreground">No delivery address was submitted with this analysis.</p>
        ) : !geocoded ? (
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Could not geocode this address. Add <code className="rounded bg-muted px-1 text-xs">GOOGLE_MAPS_API_KEY</code>{" "}
              on the server and include street, city, and country in the extension panel.
            </p>
            <p className="text-foreground">{raw}</p>
          </div>
        ) : (
          <>
            <p className="font-medium text-foreground">{data.address_formatted}</p>
            <p className="text-muted-foreground">
              {[data.address_city, data.address_province, data.address_country].filter(Boolean).join(", ") || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Precision: </span>
              {data.address_precision ?? "—"}
            </p>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Quality score: {quality}/100</p>
              <div className="h-2 rounded-full bg-muted">
                <div className={`h-2 rounded-full ${qualityColor}`} style={{ width: `${quality}%` }} />
              </div>
            </div>
            {mapUrl ? (
              <iframe
                title="Buyer address map"
                src={mapUrl}
                className="mt-2 h-44 w-full rounded-[var(--radius-sm)] border border-border"
                loading="lazy"
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
