import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { game_mode, team1_name, team2_name } = body;

    const db = await createSupabaseServerClient();
    const { data: { user } } = await db.auth.getUser();

    const { data, error } = await db
      .from('games')
      .insert([
        {
          game_mode,
          player_count: 4,
          team1_name: game_mode === 'group' ? team1_name : null,
          team2_name: game_mode === 'group' ? team2_name : null,
          total_rounds: 0,
          user_id: user?.id ?? null,
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

    const db = await createSupabaseServerClient();
    const { data, error } = await db
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
