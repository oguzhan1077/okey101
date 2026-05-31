import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { winner_name, winner_type, game_statistics, client_user_id } = body;

    // Kullanıcıyı session'dan doğrula, başarısız olursa client'tan gelen id'yi kullan
    const serverClient = await createSupabaseServerClient();
    const { data: { user } } = await serverClient.auth.getUser();
    const user_id = user?.id ?? client_user_id ?? null;

    // Kimliği doğrulanmış kullanıcı için serverClient, misafir için anonClient
    const db: SupabaseClient = user ? serverClient : anonClient;

    const { data: existingGame } = await db
      .from('games')
      .select('finished_at')
      .eq('id', id)
      .single();

    if (existingGame?.finished_at) {
      return NextResponse.json({ message: 'Game already finished', data: existingGame }, { status: 200 });
    }

    const updateData: any = { winner_name, winner_type, finished_at: new Date().toISOString() };
    if (user_id) updateData.user_id = user_id;

    const { data, error } = await db
      .from('games')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Game finish error:', error);
      return NextResponse.json({ error: 'Failed to finish game' }, { status: 500 });
    }

    await Promise.allSettled([
      user_id && game_statistics
        ? saveGameStatistics(id, user_id, game_statistics, serverClient)
        : Promise.resolve(),
      user_id
        ? updateUserProfile(user_id, data.game_mode, data.total_rounds, serverClient)
        : Promise.resolve(),
    ]);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error finishing game:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function saveGameStatistics(
  gameId: string,
  userId: string,
  statistics: any,
  db: SupabaseClient,
) {
  try {
    const { error } = await db.from('game_statistics').insert([{
      game_id: gameId,
      user_id: userId,
      players: statistics.players,
      rounds: statistics.rounds || null,
      total_okeys: statistics.total_okeys || 0,
      total_penalties: statistics.total_penalties || 0,
      total_finished_hands: statistics.total_finished_hands || 0,
      highest_round_score: statistics.highest_round_score || 0,
      lowest_round_score: statistics.lowest_round_score || 0,
      team1_total_score: statistics.team1_total_score || 0,
      team2_total_score: statistics.team2_total_score || 0,
    }]);
    if (error) console.error('Error saving game statistics:', error);
  } catch (error) {
    console.error('Error in saveGameStatistics:', error);
  }
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
