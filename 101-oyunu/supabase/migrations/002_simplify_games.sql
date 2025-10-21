-- Games tablosunu basitleştir - Sadece özet bilgiler

-- Eski tabloyu yedekle (opsiyonel)
-- CREATE TABLE games_backup AS SELECT * FROM games;

-- Tabloyu yeniden oluştur
DROP TABLE IF EXISTS games CASCADE;

CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  game_mode TEXT NOT NULL CHECK (game_mode IN ('group', 'single')),
  
  -- Sadece genel bilgiler
  player_count INTEGER DEFAULT 4,
  team1_name TEXT,  -- Grup modunda 1. takım
  team2_name TEXT,  -- Grup modunda 2. takım
  
  -- Sonuç bilgileri
  winner_name TEXT,
  winner_type TEXT, -- 'team1', 'team2', 'single', 'tie'
  total_rounds INTEGER DEFAULT 0,
  
  -- Zaman bilgileri
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  finished_at TIMESTAMP WITH TIME ZONE
  
  CONSTRAINT valid_team_mode CHECK (
    (game_mode = 'group' AND team1_name IS NOT NULL AND team2_name IS NOT NULL) 
    OR game_mode = 'single'
  )
);

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_games_venue_id ON games(venue_id);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_finished_at ON games(finished_at DESC) WHERE finished_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_mode ON games(game_mode);

COMMENT ON TABLE games IS 'Oynanan oyunların özet bilgileri (detaylar localStorage)';
COMMENT ON COLUMN games.player_count IS 'Oyuncu sayısı (genelde 4)';
COMMENT ON COLUMN games.team1_name IS 'Grup modunda 1. takım ismi';
COMMENT ON COLUMN games.team2_name IS 'Grup modunda 2. takım ismi';
COMMENT ON COLUMN games.winner_name IS 'Kazanan takım/oyuncu ismi';
COMMENT ON COLUMN games.winner_type IS 'Kazanan tipi: team1, team2, single, tie';

