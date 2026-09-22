/* ═══════════════════════════════════════════════════════════
   POKER MES — SUPABASE CLIENT CONFIGURATION
═══════════════════════════════════════════════════════════ */

const SUPABASE_URL = "https://ycvaizqklkbpjvbidfih.supabase.co";
const SUPABASE_KEY = "sb_publishable_3oPfVkQz7bhIq52fBi4eHw_uF3K2mWJ";

// Initialize client if script loaded
let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
  console.warn("Supabase CDN not loaded yet, will initialize when ready.");
}
