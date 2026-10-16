import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl =
  import.meta.env['VITE_SUPABASE_URL'] ||
  (typeof process !== 'undefined' ? process.env['SUPABASE_URL'] : undefined);
const supabasePublishableKey =
  import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ||
  (typeof process !== 'undefined' ? process.env['SUPABASE_PUBLISHABLE_KEY'] : undefined);

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the environment.',
  );
}

/** Public client; database authorization is enforced by Supabase RLS. */
export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
