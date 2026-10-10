-- TEST BİTTİ: Tüm oyun verisini ve test oyuncularını siler; gerçek oyunlara temiz başlanır.
-- Silinenler: TÜM oyunlar, eller, sonuçlar, Elo puanları, okey modelinin sonradan öğrenilen sürümleri,
--             test oyuncuları (Test Ali/Ayşe/Can).
-- Kalanlar:   gerçek hesaplar ve görünen adları, arşivdeki eski oyunlar, okey modelinin başlangıç değeri.
-- GERÇEK OYUNLAR BAŞLAMADAN ÖNCE çalıştır; sonradan çalıştırılırsa gerçek oyunlar da silinir. Geri alınamaz.

BEGIN;

DELETE FROM games;            -- oyuncular, eller, düzeltmeler, beceri ve sonuçlar da birlikte silinir
DELETE FROM player_ratings;
DELETE FROM okey_model WHERE id > (SELECT min(id) FROM okey_model);
DELETE FROM profiles WHERE id IN ('b0000000-0000-4000-8000-000000000001',
                                  'b0000000-0000-4000-8000-000000000002',
                                  'b0000000-0000-4000-8000-000000000003');

COMMIT;

SELECT (SELECT count(*) FROM games) AS oyun, (SELECT count(*) FROM player_ratings) AS elo,
       (SELECT count(*) FROM okey_model) AS okey_model, (SELECT count(*) FROM profiles) AS hesap;
