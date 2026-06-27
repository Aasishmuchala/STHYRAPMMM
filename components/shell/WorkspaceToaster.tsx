"use client";

import { Toaster } from "react-hot-toast";

export function WorkspaceToaster() {
  return (
    <Toaster
      position="top-right"
      gutter={10}
      toastOptions={{
        duration: 3600,
        style: {
          borderRadius: "14px",
          background: "rgba(255, 255, 255, 0.96)",
          color: "#172033",
          border: "1px solid rgba(148, 163, 184, 0.18)",
          boxShadow: "0 20px 40px -26px rgba(15, 23, 42, 0.4)",
          padding: "14px 16px",
          fontSize: "13px",
          maxWidth: "420px",
        },
        success: {
          iconTheme: {
            primary: "#10b981",
            secondary: "#ffffff",
          },
        },
        error: {
          iconTheme: {
            primary: "#ef4444",
            secondary: "#ffffff",
          },
        },
        loading: {
          iconTheme: {
            primary: "#2563eb",
            secondary: "#ffffff",
          },
        },
      }}
    />
  );
}
