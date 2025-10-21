-- Skor alanlarını INTEGER'dan NUMERIC'e çevir (ondalıklı sayıları kabul etmesi için)
-- View bu sütunları kullandığı için önce view'ı silmeliyiz

-- 1. View'ı geçici olarak sil
DROP VIEW IF EXISTS user_game_history;

-- 2. Sütun tiplerini değiştir
ALTER TABLE game_statistics 
ALTER COLUMN highest_round_score TYPE NUMERIC USING highest_round_score::NUMERIC,
ALTER COLUMN lowest_round_score TYPE NUMERIC USING lowest_round_score::NUMERIC,
ALTER COLUMN team1_total_score TYPE NUMERIC USING team1_total_score::NUMERIC,
ALTER COLUMN team2_total_score TYPE NUMERIC USING team2_total_score::NUMERIC;

-- 3. Default değerleri yeniden ayarla
ALTER TABLE game_statistics 
ALTER COLUMN highest_round_score SET DEFAULT 0,
ALTER COLUMN lowest_round_score SET DEFAULT 0,
ALTER COLUMN team1_total_score SET DEFAULT 0,
ALTER COLUMN team2_total_score SET DEFAULT 0;

-- 4. Yorumları güncelle
COMMENT ON COLUMN game_statistics.highest_round_score IS 'Bir roundda alınan en yüksek puan (ondalıklı olabilir)';
COMMENT ON COLUMN game_statistics.lowest_round_score IS 'Bir roundda alınan en düşük puan (negatif ve ondalıklı olabilir)';
COMMENT ON COLUMN game_statistics.team1_total_score IS 'Takım 1 toplam skoru (ondalıklı olabilir)';
COMMENT ON COLUMN game_statistics.team2_total_score IS 'Takım 2 toplam skoru (ondalıklı olabilir)';

-- 5. View'ı yeniden oluştur (artık NUMERIC tipli sütunlarla)
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

