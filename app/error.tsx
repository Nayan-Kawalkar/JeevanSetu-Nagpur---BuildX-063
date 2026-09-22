"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    // Keep the console clean of anything sensitive: message only, never the full request.
    console.error("[JeevanSetu] page error:", error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6">
      <h1 className="text-lg font-semibold text-red-800">Something went wrong</h1>
      <p className="mt-2 text-sm text-red-700">
        The page could not be rendered. Emergency data is unaffected; retry or return to the landing page.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-red-600">ref {error.digest}</p>}
      <div className="mt-4 flex gap-2">
        <Button variant="danger" onClick={reset}>Try again</Button>
        <Button variant="secondary" onClick={() => router.push("/")}>Go home</Button>
      </div>
    </div>
  );
}
