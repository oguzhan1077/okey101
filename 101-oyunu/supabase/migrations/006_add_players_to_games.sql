-- games tablosuna oyuncu isimleri için JSONB kolonu ekle
ALTER TABLE games
ADD COLUMN IF NOT EXISTS players JSONB;

COMMENT ON COLUMN games.players IS 'Oyuncu isimleri: ["Oğuzhan", "Levent", "Deniz", "Berk"]';
