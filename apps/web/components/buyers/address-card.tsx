interface AddressData {
  address_formatted: string | null;
  address_city: string | null;
  address_province: string | null;
  address_country: string | null;
  address_quality_score: number | null;
  address_precision?: string | null;
  address_lat: number | null;
  address_lng: number | null;
}

export function AddressCard({ data }: { data: AddressData }) {
  const quality = data.address_quality_score ?? 0;
  const qualityColor = quality >= 75 ? "bg-emerald-500" : quality >= 45 ? "bg-yellow-500" : "bg-red-500";
  const mapUrl =
    data.address_lat != null && data.address_lng != null
      ? `https://www.google.com/maps?q=${data.address_lat},${data.address_lng}&z=15&output=embed`
      : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-500">Address Analysis</h3>
      <div className="space-y-2 text-sm">
        <p>{data.address_formatted ?? "Address not found"}</p>
        <p>
          {data.address_city ?? "-"}, {data.address_province ?? "-"}, {data.address_country ?? "-"}
        </p>
        <p>Precision: {data.address_precision ?? "Unknown"}</p>
        <div>
          <p className="mb-1 text-xs text-slate-500">Quality Score: {quality}/100</p>
          <div className="h-2 rounded-full bg-slate-200">
            <div className={`h-2 rounded-full ${qualityColor}`} style={{ width: `${quality}%` }} />
          </div>
        </div>
        {mapUrl ? (
          <iframe
            title="Buyer address map"
            src={mapUrl}
            className="mt-2 h-44 w-full rounded-lg border border-slate-200"
            loading="lazy"
          />
        ) : null}
      </div>
    </div>
  );
}
