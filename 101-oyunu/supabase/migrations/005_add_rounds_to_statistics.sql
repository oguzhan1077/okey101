-- game_statistics tablosuna round detayları için JSONB kolonu ekle
ALTER TABLE game_statistics
ADD COLUMN IF NOT EXISTS rounds JSONB;

COMMENT ON COLUMN game_statistics.rounds IS 'Her elin detayları: [{round, players: [{name, points, penalty, hasOkey1, hasOkey2, total, finished, handFinished}]}]';
