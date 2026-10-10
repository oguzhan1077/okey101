import { supabase } from '@/lib/supabase';

export interface RegisteredPlayer {
  id: string;
  display_name: string;
}

export const NAME_REGEX = /^[a-zA-ZğĞıİşŞüÜöÖçÇ0-9., ]*$/;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 20;

/** İsim karşılaştırması için: baş/son boşluk ve büyük/küçük harf (Türkçe) duyarsız */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
}

/** Görünen ad kurallarına uymuyorsa hata mesajı, uyuyorsa null döner */
export function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < DISPLAY_NAME_MIN) return `Görünen ad en az ${DISPLAY_NAME_MIN} karakter olmalı`;
  if (trimmed.length > DISPLAY_NAME_MAX) return `Görünen ad en fazla ${DISPLAY_NAME_MAX} karakter olabilir`;
  if (!NAME_REGEX.test(trimmed)) return 'Görünen ad sadece harf, rakam, boşluk, nokta ve virgül içerebilir';
  return null;
}

export async function isDisplayNameAvailable(name: string): Promise<boolean> {
  if (!supabase) return true;
  const { data, error } = await supabase.rpc('is_display_name_available', { p_name: name.trim() });
  if (error) throw error;
  return data === true;
}

export async function fetchOwnDisplayName(userId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.display_name ?? null;
}

/** Kendi görünen adını kaydeder; ad başkası tarafından alınmışsa 'taken' döner */
export async function saveOwnDisplayName(name: string): Promise<'ok' | 'taken' | 'invalid'> {
  if (!supabase) throw new Error('Supabase hazır değil');
  const { data, error } = await supabase.rpc('set_display_name', { p_name: name.trim() });
  if (error) throw error;
  return data as 'ok' | 'taken' | 'invalid';
}

export const PLAYER_SUGGESTION_LIMIT = 5;

/** Ada göre kayıtlı oyuncu arar (sunucuda; en fazla 5 sonuç, tam eşleşme önce) */
export async function searchPlayers(query: string): Promise<RegisteredPlayer[]> {
  if (!supabase || !query.trim()) return [];
  const { data, error } = await supabase.rpc('search_players', { p_query: query, p_limit: PLAYER_SUGGESTION_LIMIT });
  if (error) throw error;
  return (data ?? []) as RegisteredPlayer[];
}
