interface PhoneData {
  phone_number?: string | null;
  phone_valid?: boolean | null;
  phone_carrier?: string | null;
  phone_type?: string | null;
  phone_is_voip?: boolean | null;
  phone_country?: string | null;
}

export function PhoneCard({ data }: { data: PhoneData }) {
  const raw = data.phone_number?.trim();
  const hasNumber = Boolean(raw);
  const validated =
    data.phone_valid === true || data.phone_valid === false || Boolean(data.phone_carrier || data.phone_country);

  let statusLabel = "—";
  let statusClass = "text-muted-foreground";
  if (!hasNumber) {
    statusLabel = "Not provided";
    statusClass = "text-muted-foreground";
  } else if (!validated) {
    statusLabel = "Not verified (add ABSTRACT_API_KEY on server)";
    statusClass = "text-primary";
  } else if (data.phone_valid === true) {
    statusLabel = "Valid";
    statusClass = "text-emerald-600 dark:text-emerald-400";
  } else {
    statusLabel = "Invalid";
    statusClass = "text-destructive";
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card p-4 shadow-none">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone analysis</h3>
      <div className="space-y-2 text-sm leading-[18px] text-foreground">
        <p>
          <span className="text-muted-foreground">Number: </span>
          <span className="font-medium">{raw || "—"}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Status: </span>
          <span className={`font-semibold ${statusClass}`}>{statusLabel}</span>
        </p>
        {validated ? (
          <>
            <p>
              <span className="text-muted-foreground">Carrier: </span>
              {data.phone_carrier ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Type: </span>
              {data.phone_type ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Country: </span>
              {data.phone_country ?? "—"}
            </p>
            {data.phone_is_voip ? (
              <p className="font-semibold text-destructive">VoIP warning — higher COD risk</p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
