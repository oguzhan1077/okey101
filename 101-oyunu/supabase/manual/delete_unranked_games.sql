-- Derecesiz (deneme) oyunları siler.
-- Derecesiz oyunlar Elo'ya ve okey modeline dokunmaz (learn_from_unranked = false), ama
-- profil istatistiklerine (kazanma oranı, ortalamalar) ve genel ortalamaya girer; silinince oradan da çıkar.
-- Oyunla birlikte oyuncuları, elleri, düzeltmeleri, beceri ve sonuç satırları da silinir. Geri alınamaz.

-- ── 1. ADIM: Önce sadece bunu çalıştır, silinecek oyunlara bak ─────────────

SELECT g.id, g.created_at AT TIME ZONE 'Europe/Istanbul' AS kurulma, g.mode, g.status, g.round_count,
       (SELECT string_agg(gp.name, ' · ' ORDER BY gp.seat) FROM game_players gp WHERE gp.game_id = g.id) AS oyuncular,
       EXISTS (SELECT 1 FROM okey_model m WHERE m.source_game_id = g.id) AS okey_modeline_girdi
FROM games g
WHERE NOT g.is_ranked
ORDER BY g.created_at;

-- ── 2. ADIM: Liste doğruysa 1. adımı silip aşağıdaki satırların başındaki "-- " işaretlerini kaldır ──
-- Sadece bazılarını silmek istersen WHERE'e ekle:  AND id IN ('...', '...')
-- okey_modeline_girdi sütununda true olan varsa ÇALIŞTIRMA, önce haber ver.

-- DELETE FROM games WHERE NOT is_ranked;
--
-- SELECT (SELECT count(*) FROM games WHERE NOT is_ranked) AS kalan_derecesiz,
--        (SELECT count(*) FROM games WHERE is_ranked) AS dereceli;
