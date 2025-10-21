import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Yeni oyun başlat (basitleştirilmiş)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { venue_id, game_mode, team1_name, team2_name } = body;

    // Sadece özet bilgileri kaydet
    const { data, error } = await supabase
      .from('games')
      .insert([
        {
          venue_id: venue_id || null,
          game_mode,
          player_count: 4,
          team1_name: game_mode === 'group' ? team1_name : null,
          team2_name: game_mode === 'group' ? team2_name : null,
          total_rounds: 0,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Game creation error:', error);
      return NextResponse.json(
        { error: 'Failed to create game' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creating game:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Oyun ID'sine göre oyun getir
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('id');

    if (!gameId) {
      return NextResponse.json(
        { error: 'Game ID required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching game:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

