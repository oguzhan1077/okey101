import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Oyunu bitir ve istatistikleri kaydet
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { winner_name, winner_type, user_id, game_statistics } = body;

    // Önce oyunun zaten bitip bitmediğini kontrol et
    const { data: existingGame } = await supabase
      .from('games')
      .select('finished_at')
      .eq('id', id)
      .single();

    if (existingGame?.finished_at) {
      // Oyun zaten bitmiş, tekrar bitirme
      console.log('Game already finished:', id);
      return NextResponse.json(
        { message: 'Game already finished', data: existingGame },
        { status: 200 }
      );
    }

    // Oyunu bitir - sadece özet bilgiler
    const updateData: any = {
      winner_name,
      winner_type,
      finished_at: new Date().toISOString(),
    };

    // Eğer user_id varsa ekle (üye kullanıcı)
    if (user_id) {
      updateData.user_id = user_id;
    }

    const { data, error } = await supabase
      .from('games')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Game finish error:', error);
      return NextResponse.json(
        { error: 'Failed to finish game' },
        { status: 500 }
      );
    }

    // İstatistikleri güncelle (varsa venue_id)
    if (data.venue_id) {
      await updateVenueStatistics(data.venue_id, data.game_mode, data.total_rounds);
    }

    // Detaylı oyun istatistiklerini kaydet (sadece üye kullanıcılar için)
    if (user_id && game_statistics) {
      await saveGameStatistics(id, user_id, game_statistics);
    }

    // Kullanıcı profilini güncelle (varsa)
    if (user_id) {
      await updateUserProfile(user_id, data.game_mode, winner_type, data.total_rounds);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error finishing game:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Venue istatistiklerini güncelle
async function updateVenueStatistics(
  venueId: string,
  gameMode: string,
  totalRounds: number
) {
  try {
    // Mevcut istatistikleri getir
    const { data: stats } = await supabase
      .from('venue_statistics')
      .select('*')
      .eq('venue_id', venueId)
      .single();

    if (stats) {
      // Güncelle
      await supabase
        .from('venue_statistics')
        .update({
          total_games: (stats.total_games || 0) + 1,
          total_rounds: (stats.total_rounds || 0) + totalRounds,
          most_played_mode: gameMode,
          last_game_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('venue_id', venueId);
    } else {
      // İlk kez oluştur
      await supabase.from('venue_statistics').insert([
        {
          venue_id: venueId,
          total_games: 1,
          total_rounds: totalRounds,
          most_played_mode: gameMode,
          last_game_at: new Date().toISOString(),
        },
      ]);
    }
  } catch (error) {
    console.error('Error updating venue statistics:', error);
  }
}

// Detaylı oyun istatistiklerini kaydet
async function saveGameStatistics(
  gameId: string,
  userId: string,
  statistics: any
) {
  try {
    const { error } = await supabase
      .from('game_statistics')
      .insert([
        {
          game_id: gameId,
          user_id: userId,
          players: statistics.players,
          total_okeys: statistics.total_okeys || 0,
          total_penalties: statistics.total_penalties || 0,
          total_finished_hands: statistics.total_finished_hands || 0,
          highest_round_score: statistics.highest_round_score || 0,
          lowest_round_score: statistics.lowest_round_score || 0,
          team1_total_score: statistics.team1_total_score || 0,
          team2_total_score: statistics.team2_total_score || 0,
        },
      ]);

    if (error) {
      console.error('Error saving game statistics:', error);
    }
  } catch (error) {
    console.error('Error in saveGameStatistics:', error);
  }
}

// Kullanıcı profilini güncelle
async function updateUserProfile(
  userId: string,
  gameMode: string,
  winnerType: string,
  totalRounds: number
) {
  try {
    // Mevcut profili getir
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    const isWinner = winnerType !== 'tie'; // Beraberlik değilse kazanan var demektir
    
    if (profile) {
      // Güncelle
      await supabase
        .from('user_profiles')
        .update({
          total_games_played: (profile.total_games_played || 0) + 1,
          total_games_won: (profile.total_games_won || 0) + (isWinner ? 1 : 0),
          total_rounds_played: (profile.total_rounds_played || 0) + totalRounds,
          favorite_mode: gameMode,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    } else {
      // İlk kez oluştur
      await supabase.from('user_profiles').insert([
        {
          id: userId,
          total_games_played: 1,
          total_games_won: isWinner ? 1 : 0,
          total_rounds_played: totalRounds,
          favorite_mode: gameMode,
        },
      ]);
    }
  } catch (error) {
    console.error('Error updating user profile:', error);
  }
}

