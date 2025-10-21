-- Kullanıcı oyun takibi ve istatistikleri için güncellemeler

-- 1. Games tablosuna user_id ekle (opsiyonel - anonim oyunlar için null olabilir)
ALTER TABLE games 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_games_user_id ON games(user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN games.user_id IS 'Oyunu oynayan kullanıcı (anonim oyunlar için null)';

-- 2. Oyun İstatistikleri Tablosu
CREATE TABLE IF NOT EXISTS game_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Oyuncu bilgileri (JSON - round bazlı değil, oyun sonu özeti)
  players JSONB NOT NULL, -- [{name, total_score, okey_count, penalty_count, finished_count}]
  
  -- Genel istatistikler
  total_okeys INTEGER DEFAULT 0,          -- Toplam okey sayısı
  total_penalties INTEGER DEFAULT 0,      -- Toplam ceza sayısı
  total_finished_hands INTEGER DEFAULT 0, -- Toplam bitirilen el sayısı
  highest_round_score INTEGER DEFAULT 0,  -- Bir roundda alınan en yüksek puan
  lowest_round_score INTEGER DEFAULT 0,   -- Bir roundda alınan en düşük puan (negatif olabilir)
  
  -- Takım istatistikleri (grup modu için)
  team1_total_score INTEGER DEFAULT 0,
  team2_total_score INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_game_stats_game_id ON game_statistics(game_id);
CREATE INDEX IF NOT EXISTS idx_game_stats_user_id ON game_statistics(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_stats_created_at ON game_statistics(created_at DESC);

-- Yorumlar
COMMENT ON TABLE game_statistics IS 'Oyun sonu detaylı istatistikleri (sadece üye kullanıcılar için)';
COMMENT ON COLUMN game_statistics.players IS 'Oyuncuların oyun sonu özet istatistikleri';
COMMENT ON COLUMN game_statistics.total_okeys IS 'Oyunda toplam kaç okey (1 ve 2) yapıldı';
COMMENT ON COLUMN game_statistics.total_penalties IS 'Oyunda toplam kaç ceza verildi';
COMMENT ON COLUMN game_statistics.total_finished_hands IS 'Kaç el bitirilerek kazanıldı';

-- 3. RLS Politikaları

-- Games tablosu için RLS (user_id ekledik)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir
DROP POLICY IF EXISTS "Enable read access for all users" ON games;
CREATE POLICY "Enable read access for all users" ON games
FOR SELECT USING (true);

-- Herkes ekleyebilir
DROP POLICY IF EXISTS "Enable insert for all users" ON games;
CREATE POLICY "Enable insert for all users" ON games
FOR INSERT WITH CHECK (true);

-- Herkes güncelleyebilir (oyun başlangıçta user_id=null, bitişte set ediliyor)
DROP POLICY IF EXISTS "Enable update for all users" ON games;
DROP POLICY IF EXISTS "Enable update for own games or anonymous" ON games;
CREATE POLICY "Enable update for all users" ON games
FOR UPDATE USING (true);

-- Game Statistics için RLS
ALTER TABLE game_statistics ENABLE ROW LEVEL SECURITY;

-- Kullanıcılar sadece kendi istatistiklerini görebilir
CREATE POLICY "Users can view own statistics" ON game_statistics
FOR SELECT USING (
  user_id IS NULL OR
  user_id = auth.uid()
);

-- Herkes ekleyebilir (oyun bitiminde)
CREATE POLICY "Enable insert for all users" ON game_statistics
FOR INSERT WITH CHECK (true);

-- Kimse güncelleyemez (immutable)
CREATE POLICY "No updates allowed" ON game_statistics
FOR UPDATE USING (false);

-- Kimse silemez (sadmin dışında)
CREATE POLICY "No deletes allowed" ON game_statistics
FOR DELETE USING (false);

-- 4. Kullanıcı profil tablosu (varsa güncelle, yoksa oluştur)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  
  -- İstatistikler (cache)
  total_games_played INTEGER DEFAULT 0,
  total_games_won INTEGER DEFAULT 0,
  total_rounds_played INTEGER DEFAULT 0,
  favorite_mode TEXT, -- 'single' veya 'group'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON user_profiles(id);

COMMENT ON TABLE user_profiles IS 'Kullanıcı profil ve toplam istatistikleri';

-- RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Kullanıcılar sadece kendi profillerini görebilir
CREATE POLICY "Users can view own profile" ON user_profiles
FOR SELECT USING (id = auth.uid());

-- Kullanıcılar kendi profillerini güncelleyebilir
CREATE POLICY "Users can update own profile" ON user_profiles
FOR UPDATE USING (id = auth.uid());

-- Kullanıcılar kendi profillerini oluşturabilir
CREATE POLICY "Users can insert own profile" ON user_profiles
FOR INSERT WITH CHECK (id = auth.uid());

-- 5. Trigger: user_profiles updated_at otomatik güncelleme
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_profiles_modtime 
BEFORE UPDATE ON user_profiles
FOR EACH ROW 
EXECUTE FUNCTION update_user_profiles_updated_at();

-- 6. View: Kullanıcı oyun geçmişi (kolay sorgu için)
CREATE OR REPLACE VIEW user_game_history AS
SELECT 
  g.id as game_id,
  g.user_id,
  g.venue_id,
  v.name as venue_name,
  g.game_mode,
  g.player_count,
  g.team1_name,
  g.team2_name,
  g.winner_name,
  g.winner_type,
  g.total_rounds,
  g.created_at,
  g.finished_at,
  gs.players as player_stats,
  gs.total_okeys,
  gs.total_penalties,
  gs.total_finished_hands,
  gs.highest_round_score,
  gs.lowest_round_score,
  gs.team1_total_score,
  gs.team2_total_score
FROM games g
LEFT JOIN venues v ON g.venue_id = v.id
LEFT JOIN game_statistics gs ON g.id = gs.game_id
WHERE g.user_id IS NOT NULL AND g.finished_at IS NOT NULL
ORDER BY g.created_at DESC;

COMMENT ON VIEW user_game_history IS 'Kullanıcı oyun geçmişi - tüm detaylar tek view';

