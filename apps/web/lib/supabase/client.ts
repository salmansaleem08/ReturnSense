import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/config";

export function createSupabaseBrowserClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublicKey());
}
