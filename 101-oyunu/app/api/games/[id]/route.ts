import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Round ekle (sadece sayıyı güncelle - basitleştirilmiş)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Mevcut oyunu getir
    const { data: game } = await supabase
      .from('games')
      .select('total_rounds')
      .eq('id', id)
      .single();

    // Round sayısını artır
    const { data, error } = await supabase
      .from('games')
      .update({
        total_rounds: (game?.total_rounds || 0) + 1,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Game update error:', error);
      return NextResponse.json(
        { error: 'Failed to update game' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating game:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

