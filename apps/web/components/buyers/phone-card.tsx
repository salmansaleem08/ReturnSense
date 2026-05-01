interface PhoneData {
  phone_number: string | null;
  phone_valid: boolean | null;
  phone_carrier: string | null;
  phone_type?: string | null;
  phone_is_voip: boolean | null;
  phone_country: string | null;
}

export function PhoneCard({ data }: { data: PhoneData }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-500">Phone Analysis</h3>
      <div className="space-y-1 text-sm">
        <p><strong>Number:</strong> {data.phone_number ?? "N/A"}</p>
        <p>
          <strong>Status:</strong>{" "}
          <span className={data.phone_valid ? "text-emerald-600" : "text-red-600"}>
            {data.phone_valid ? "Valid" : "Invalid"}
          </span>
        </p>
        <p><strong>Carrier:</strong> {data.phone_carrier ?? "Unknown"}</p>
        <p><strong>Type:</strong> {data.phone_type ?? "Unknown"}</p>
        {data.phone_is_voip ? <p className="font-semibold text-red-600">VoIP warning</p> : null}
        <p><strong>Country:</strong> {data.phone_country ?? "Unknown"}</p>
      </div>
    </div>
  );
}
