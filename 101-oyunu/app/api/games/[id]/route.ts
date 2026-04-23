import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Round ekle (client'tan gelen round sayısını direkt yaz - tek sorgu)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const total_rounds = typeof body.total_rounds === 'number' ? body.total_rounds : null;

    if (total_rounds === null) {
      return NextResponse.json({ error: 'total_rounds required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('games')
      .update({ total_rounds })
      .eq('id', id);

    if (error) {
      console.error('Game update error:', error);
      return NextResponse.json(
        { error: 'Failed to update game' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating game:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

