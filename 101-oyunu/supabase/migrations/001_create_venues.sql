-- Venues (İşletmeler) Tablosu
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3B82F6',
  secondary_color TEXT DEFAULT '#8B5CF6',
  welcome_message TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Games (Oyunlar) Tablosu
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  game_mode TEXT NOT NULL CHECK (game_mode IN ('group', 'single')),
  players JSONB NOT NULL,
  round_details JSONB,
  winner TEXT,
  total_rounds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  finished_at TIMESTAMP WITH TIME ZONE
);

-- Venue Statistics (İşletme İstatistikleri) Tablosu
CREATE TABLE IF NOT EXISTS venue_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  total_games INTEGER DEFAULT 0,
  total_rounds INTEGER DEFAULT 0,
  most_played_mode TEXT,
  last_game_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(venue_id)
);

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_venues_slug ON venues(slug);
CREATE INDEX IF NOT EXISTS idx_games_venue_id ON games(venue_id);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);

-- Trigger: venues updated_at otomatik güncelleme
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON venues
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Örnek venue ekle (test için)
INSERT INTO venues (name, slug, welcome_message, primary_color, secondary_color)
VALUES 
  ('Demo Kafe', 'demo-kafe', 'Demo Kafe''ye hoş geldiniz! 101 oyununun tadını çıkarın.', '#10B981', '#3B82F6'),
  ('Test Restaurant', 'test-restaurant', 'Test Restaurant''a hoş geldiniz!', '#EF4444', '#F59E0B')
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE venues IS 'İşletme bilgileri ve özelleştirmeleri';
COMMENT ON TABLE games IS 'Oynanan oyunların kayıtları';
COMMENT ON TABLE venue_statistics IS 'İşletme bazlı oyun istatistikleri';

