interface PhoneData {
  phone_number?: string | null;
  phone_valid?: boolean | null;
  phone_carrier?: string | null;
  phone_type?: string | null;
  phone_is_voip?: boolean | null;
  phone_country?: string | null;
  phone_region?: string | null;
  phone_city?: string | null;
  phone_international_format?: string | null;
  phone_local_format?: string | null;
  phone_lookup_query?: string | null;
}

export function PhoneCard({ data }: { data: PhoneData }) {
  const raw = data.phone_number?.trim();
  const hasNumber = Boolean(raw);
  const intl = data.phone_international_format?.trim();
  const national = data.phone_local_format?.trim();
  const displayNumber = intl || national || raw || "—";

  const validated =
    data.phone_valid === true ||
    data.phone_valid === false ||
    Boolean(data.phone_carrier || data.phone_country || intl);

  let statusLabel = "—";
  let statusClass = "text-muted-foreground";
  if (!hasNumber) {
    statusLabel = "Not provided";
    statusClass = "text-muted-foreground";
  } else if (!validated) {
    statusLabel =
      "No verification on file — run Analyze again from the extension. If it persists, confirm phone intelligence is configured on the server.";
    statusClass = "text-amber-600 dark:text-amber-500";
  } else if (data.phone_valid === true) {
    statusLabel = "Valid";
    statusClass = "text-emerald-600 dark:text-emerald-400";
  } else {
    statusLabel = "Invalid or unverified";
    statusClass = "text-destructive";
  }

  const lookupExtra = data.phone_lookup_query?.trim();
  const showLookupNote =
    lookupExtra &&
    lookupExtra.replace(/\D/g, "") !== (raw ?? "").replace(/\D/g, "") &&
    lookupExtra.startsWith("+");

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card p-4 shadow-none">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone analysis</h3>
      <div className="space-y-2 text-sm leading-[18px] text-foreground">
        <p>
          <span className="text-muted-foreground">Number (submitted): </span>
          <span className="font-medium">{raw || "—"}</span>
        </p>
        {(intl || national) && (
          <p>
            <span className="text-muted-foreground">Formatted: </span>
            <span className="font-medium tabular-nums">
              {intl ? (
                <>
                  <span className="text-foreground">{intl}</span>
                  {national ? <span className="text-muted-foreground"> ({national})</span> : null}
                </>
              ) : (
                national
              )}
            </span>
          </p>
        )}
        {!intl && !national && hasNumber && (
          <p>
            <span className="text-muted-foreground">Display: </span>
            <span className="font-medium tabular-nums">{displayNumber}</span>
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Status: </span>
          <span className={`font-semibold ${statusClass}`}>{statusLabel}</span>
        </p>
        {showLookupNote ? (
          <p className="text-xs text-muted-foreground">
            Lookup used international format{" "}
            <span className="font-mono text-foreground/90">{lookupExtra}</span> for carrier data (common for 03… → +92…).
          </p>
        ) : null}
        {validated ? (
          <>
            {data.phone_carrier?.trim() ? (
              <p>
                <span className="text-muted-foreground">Carrier: </span>
                {data.phone_carrier}
              </p>
            ) : null}
            {data.phone_type?.trim() ? (
              <p>
                <span className="text-muted-foreground">Line type: </span>
                {data.phone_type}
              </p>
            ) : null}
            {data.phone_country?.trim() ? (
              <p>
                <span className="text-muted-foreground">Country: </span>
                {data.phone_country}
              </p>
            ) : null}
            {data.phone_region?.trim() ? (
              <p>
                <span className="text-muted-foreground">Region: </span>
                {data.phone_region}
              </p>
            ) : null}
            {data.phone_city?.trim() ? (
              <p>
                <span className="text-muted-foreground">City: </span>
                {data.phone_city}
              </p>
            ) : null}
            {data.phone_is_voip ? (
              <p className="font-semibold text-destructive">VoIP warning — higher COD risk</p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
