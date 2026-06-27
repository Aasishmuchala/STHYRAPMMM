"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Hook for telemetry. The digest is safe to log; the full message is not.
    if (error?.digest) {
      // eslint-disable-next-line no-console
      console.error("[sthyra] Global error:", error.digest);
    }
  }, [error]);

  return (
    <html>
      <body>
        <div className="global-error">
          <div className="global-error-card">
            <h1>Something broke.</h1>
            <p>The workspace hit an unexpected error. We&apos;ve logged the digest and you can retry.</p>
            {error?.digest && (
              <p className="mono" style={{ opacity: 0.6, fontSize: 12 }}>Digest: {error.digest}</p>
            )}
            <button onClick={() => reset()}>Retry</button>
          </div>
        </div>
      </body>
    </html>
  );
}