import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { isCompanyEmail } from "@/lib/auth/companyEmail";

type Payload = {
  fullName?: string;
};

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;

  return createAdminClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Payload | null;
  const fullName = payload?.fullName?.trim() || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "You need to verify your email first." }, { status: 401 });
  }
  if (!isCompanyEmail(user.email)) {
    return NextResponse.json({ error: "Only @sthyra.com email accounts can access Sthyra." }, { status: 403 });
  }

  const admin = getServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  }

  const { data: existing, error: readError } = await admin
    .from("profiles")
    .select("global_role")
    .eq("id", user.id)
    .maybeSingle<{ global_role: Database["public"]["Enums"]["global_role"] }>();

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  if (existing) {
    const { error } = await admin
      .from("profiles")
      .update({
        email: user.email ?? null,
        full_name: fullName,
        is_active: true,
      })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await admin.from("profiles").insert({
      id: user.id,
      email: user.email ?? null,
      full_name: fullName,
      global_role: "member",
      is_active: true,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
