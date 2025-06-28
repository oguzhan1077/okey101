import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ Supabase environment variables eksik! .env dosyasını kontrol edin.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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