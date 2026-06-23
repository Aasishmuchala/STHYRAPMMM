"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="glass" style={{ maxWidth: 440, borderRadius: 16, padding: 34, textAlign: "center" }}>
        <h2 className="display" style={{ fontSize: 24, marginBottom: 10 }}>Something went wrong</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6, marginBottom: 22 }}>
          {error.message || "An unexpected error occurred while loading this view."}
        </p>
        <button className="btn" onClick={reset} style={{ justifyContent: "center" }}>Try again</button>
      </div>
    </div>
  );
}
