import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Supabase client oluştur
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Tüm venue'leri getir
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch venues' },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error fetching venues:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Yeni venue oluştur (sadece admin)
export async function POST(request: Request) {
  try {
    // Auth token kontrolü
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - Login required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    
    // Kullanıcı bilgilerini al
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid token' },
        { status: 401 }
      );
    }

    // Admin kontrolü (email bazlı)
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(email => email.trim()) || [];
    
    if (adminEmails.length === 0) {
      // Eğer hiç admin email tanımlı değilse, herhangi bir giriş yapmış kullanıcı admin sayılır
      console.warn('⚠️ ADMIN_EMAILS environment variable not set! Any authenticated user can create venues.');
    } else if (!adminEmails.includes(user.email || '')) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, slug, logo_url, primary_color, secondary_color, welcome_message } = body;

    // Slug'ı validate et
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { error: 'Invalid slug format. Use lowercase letters, numbers, and hyphens only.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('venues')
      .insert([
        {
          name,
          slug,
          logo_url,
          primary_color: primary_color || '#3B82F6',
          secondary_color: secondary_color || '#8B5CF6',
          welcome_message,
          is_active: true,
        },
      ])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json(
          { error: 'A venue with this slug already exists' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to create venue' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creating venue:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

