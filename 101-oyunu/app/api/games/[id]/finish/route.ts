import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// access_token ile authenticated client oluştur — auth.uid() çalışır, RLS geçer
function createAuthClient(accessToken: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { winner_name, winner_type, game_statistics, client_user_id, access_token } = body;

  // 1. Temel oyun güncellemesi — anon client, her zaman çalışır
  const { data: existingGame } = await anonClient
    .from('games')
    .select('finished_at, game_mode, total_rounds')
    .eq('id', id)
    .single();

  if (existingGame?.finished_at) {
    return NextResponse.json({ message: 'Game already finished', data: existingGame }, { status: 200 });
  }

  const updateData: any = { winner_name, winner_type, finished_at: new Date().toISOString() };
  if (client_user_id) updateData.user_id = client_user_id;

  const { data, error } = await anonClient
    .from('games')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Game finish error:', error);
    return NextResponse.json({ error: 'Failed to finish game', detail: error.message }, { status: 500 });
  }

  // 2. Kullanıcıya özel işlemler — access_token ile authenticated client
  if (client_user_id && access_token) {
    const authClient = createAuthClient(access_token);

    if (game_statistics) {
      const { error: statsError } = await authClient.from('game_statistics').insert([{
        game_id: id,
        user_id: client_user_id,
        players: game_statistics.players,
        rounds: game_statistics.rounds || null,
        total_okeys: game_statistics.total_okeys || 0,
        total_penalties: game_statistics.total_penalties || 0,
        total_finished_hands: game_statistics.total_finished_hands || 0,
        highest_round_score: game_statistics.highest_round_score || 0,
        lowest_round_score: game_statistics.lowest_round_score || 0,
        team1_total_score: game_statistics.team1_total_score || 0,
        team2_total_score: game_statistics.team2_total_score || 0,
      }]);
      if (statsError) console.error('Error saving game statistics:', statsError.message);
    }

    await updateUserProfile(client_user_id, data.game_mode, data.total_rounds, authClient);
  }

  return NextResponse.json(data);
}

async function updateUserProfile(
  userId: string,
  gameMode: string,
  totalRounds: number,
  db: SupabaseClient,
) {
  try {
    const { data: profile } = await db
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profile) {
      await db.from('user_profiles').update({
        total_games_played: (profile.total_games_played || 0) + 1,
        total_rounds_played: (profile.total_rounds_played || 0) + totalRounds,
        favorite_mode: gameMode,
        updated_at: new Date().toISOString(),
      }).eq('id', userId);
    } else {
      await db.from('user_profiles').insert([{
        id: userId,
        total_games_played: 1,
        total_rounds_played: totalRounds,
        favorite_mode: gameMode,
      }]);
    }
  } catch (error) {
    console.error('Error updating user profile:', error);
  }
}
