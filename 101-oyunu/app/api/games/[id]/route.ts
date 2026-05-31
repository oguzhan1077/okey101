import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

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

    const db = await createSupabaseServerClient();
    const { error } = await db
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
