"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "react-hot-toast";

export function SignOutButton({ initials }: { initials: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const toastId = toast.loading("Signing out...");
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Signed out.", { id: toastId });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      disabled={busy}
      className="pill"
      aria-label="Sign out"
      title="Sign out"
      style={{ paddingLeft: 6, gap: 9 }}
    >
      <span className="avatar" aria-hidden="true" style={{ width: 24, height: 24, fontSize: 10 }}>
        {initials}
      </span>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5M21 12H9" />
      </svg>
    </button>
  );
}
