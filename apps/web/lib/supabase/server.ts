import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase/config";

export const supabaseAdmin = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
