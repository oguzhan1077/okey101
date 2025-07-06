import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Environment variables kontrolü (production'da sessiz)
if (!supabaseUrl || !supabaseAnonKey) {
  // Sadece development ortamında uyarı
  if (process.env.NODE_ENV === 'development') {
    console.error('⚠️ Supabase environment variables eksik!')
    console.error('- NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'VAR' : 'YOK')
    console.error('- NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'VAR' : 'YOK')
    console.error('- process.env keys:', Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC')))
  }
}

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

if (!supabase) {
  console.error('❌ Supabase client oluşturulamadı! Environment variables kontrol edin.')
} 