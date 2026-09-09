import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''

export const supabaseConfigured = Boolean(url && key)
export const supabase = createClient(url || 'https://example.supabase.co', key || 'public-placeholder', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
