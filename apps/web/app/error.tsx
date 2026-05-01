"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto mt-24 max-w-lg rounded-2xl border border-red-200 bg-white p-6 text-center">
      <h2 className="text-xl font-semibold text-red-700">Something went wrong</h2>
      <p className="mt-2 text-sm text-slate-600">Please retry. If this persists, contact support.</p>
      <Button className="mt-4" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
