import { createClient } from '@supabase/supabase-js'

// Environment variables'ları debug edelim
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Environment variables kontrolü (production'da sessiz)
if (!supabaseUrl || !supabaseAnonKey) {
  // Sadece development ortamında uyarı
  if (process.env.NODE_ENV === 'development') {
    console.warn('⚠️ Supabase environment variables eksik!')
  }
}

// Fallback ile client oluştur
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Sadece development ortamında hata mesajı
if (!supabase && process.env.NODE_ENV === 'development') {
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