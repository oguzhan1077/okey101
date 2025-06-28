import { createClient } from '@supabase/supabase-js'

// Environment variables'ları debug edelim
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Debug için console log'lar (production'da kaldırılacak)
console.log('🔍 Supabase Debug:')
console.log('- URL exists:', !!supabaseUrl)
console.log('- Key exists:', !!supabaseAnonKey)
console.log('- URL length:', supabaseUrl.length)
console.log('- Key length:', supabaseAnonKey.length)

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ Supabase environment variables eksik!')
  console.error('- NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'VAR' : 'YOK')
  console.error('- NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'VAR' : 'YOK')
  console.error('- process.env keys:', Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC')))
}

// Fallback ile client oluştur
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

if (!supabase) {
  console.error('❌ Supabase client oluşturulamadı!')
}

// Database types
export interface Database {
  public: {
    Tables: {
      games: {
        Row: {
          id: string
          created_at: string
          user_id: string
          game_mode: 'group' | 'single'
          group1_name?: string
          group2_name?: string
          players: string[]
          rounds: any[]
          is_finished: boolean
          winner?: string
          final_scores?: any
        }
        Insert: {
          id?: string
          created_at?: string
          user_id: string
          game_mode: 'group' | 'single'
          group1_name?: string
          group2_name?: string
          players: string[]
          rounds?: any[]
          is_finished?: boolean
          winner?: string
          final_scores?: any
        }
        Update: {
          id?: string
          created_at?: string
          user_id?: string
          game_mode?: 'group' | 'single'
          group1_name?: string
          group2_name?: string
          players?: string[]
          rounds?: any[]
          is_finished?: boolean
          winner?: string
          final_scores?: any
        }
      }
    }
  }
} 