// Shared type alias for the loose Supabase client used across server actions
// and helpers. The generated `Database` type from Supabase is trimmed and
// confused supabase-js into typing `.select()` payloads as `never`. RLS at
// the database level is the real safety boundary, not TypeScript, so we
// deliberately use `any` for the Database/Schema generics here.
//
// One file, one pattern. Don't add new places that redefine this.
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseSupabase = SupabaseClient<any, any, any>;