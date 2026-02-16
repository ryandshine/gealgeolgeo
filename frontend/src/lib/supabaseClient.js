
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validasi ketat: harus string, bukan "undefined"/"null", mengandung http, dan minimal 10 karakter
const isValidUrl = (url) => {
    return typeof url === 'string' && 
           url.length > 10 && 
           url.includes('http') && 
           url !== 'undefined' && 
           url !== 'null';
};

const isSupabaseConfigured = Boolean(isValidUrl(supabaseUrl) && supabaseAnonKey && supabaseAnonKey !== 'undefined');

if (!isSupabaseConfigured) {
    console.warn('Supabase URL or Anon Key is missing. Persistence features will be disabled.')
}

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null
export { isSupabaseConfigured }
