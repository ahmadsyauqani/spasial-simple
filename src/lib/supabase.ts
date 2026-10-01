import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ Supabase credentials missing limit spatial features");
}

export const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseKey || "placeholder_key", {
  auth: {
    // auth-js defaults to the Navigator LockManager, which logs
    // "Lock ... was released because another request stole it" when React
    // StrictMode fires getSession twice in parallel. This app is single-tab
    // per session, so a pass-through lock is sufficient.
    lock: async <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>) => fn(),
  },
});
