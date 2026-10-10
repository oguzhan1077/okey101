-- ════════════════════════════════════════════════════════════════════════════
-- 009 — Tek yazıcı, bırakma yok, Elo yayılımı, oyuncu istatistikleri
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. Oyuna sadece oyunu kuran kişi el yazar ve oyunu bitirir; diğer oyuncular izler.
--    (Hesapsız kurulan derecesiz oyun: linki bilen cihaz yazar, değişmedi.)
-- 2. Başlamış oyun bırakılamaz (Elo'dan kaçış olmasın). Sadece hiç el girilmemiş
--    oyun iptal edilebilir: onay beklerken veya ilk elden önce.
-- 3. Elo satranç benzeri ölçeğe: formüldeki 400 → 2000 (×5), K'lar buna göre büyür,
--    puan 100'ün altına inmez. Kazanma ihtimalleri değişmez, sayılar açılır
--    (simülasyonda ~350–2600 aralığı). Sonuç eğrisi 2.5 → 1.75 (farklar ~%25 daha açık).
--    Formül sürümü v2. finish_game bu yüzden yeniden tanımlanır.
-- 4. get_player_stats: sıralamada oyuncuya tıklayınca gösterilen istatistikler.

-- ── 1–2. Yazma yetkisi ve iptal ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_write_game(p_game games, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- coalesce şart: giriş yapılmamışsa p_uid NULL olur ve karşılaştırma NULL döner;
  -- "IF NOT NULL" engellemez, yani misafir yazabilirdi
  SELECT coalesce(p_game.created_by = p_uid, false)
      OR (p_game.created_by IS NULL AND NOT p_game.is_ranked);
$$;

CREATE OR REPLACE FUNCTION public.end_game_early(p_game_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  g games%ROWTYPE;
BEGIN
  SELECT * INTO g FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oyun bulunamadı'; END IF;
  IF NOT can_write_game(g, v_uid) THEN RAISE EXCEPTION 'Oyunu sadece kuran kişi iptal edebilir'; END IF;

  IF g.status = 'pending'
     OR (g.status = 'active' AND NOT EXISTS (SELECT 1 FROM rounds WHERE game_id = p_game_id)) THEN
    UPDATE games SET status = 'cancelled', ended_at = now(), ended_by = v_uid, end_reason = 'cancelled'
    WHERE id = p_game_id;
    RETURN 'cancelled';
  ELSIF g.status = 'active' THEN
    RAISE EXCEPTION 'El girilmiş oyun iptal edilemez; oyunu Bitir ile bitirin';
  END IF;
  RETURN g.status;
END;
$$;

-- ── 3. Elo ayarları ─────────────────────────────────────────────────────────

ALTER TABLE rating_config
  ADD COLUMN rating_scale NUMERIC NOT NULL DEFAULT 400,   -- Elo beklenti formülündeki ölçek (satrançta 400)
  ADD COLUMN rating_floor NUMERIC NOT NULL DEFAULT 0;     -- puanın inebileceği en düşük değer

UPDATE rating_config
SET formula_version = 'v2',
    result_curve = 1.75,
    rating_scale = 2000,
    max_rating_diff = 2000,       -- FIDE 400 kuralı, aynı oranda
    rating_floor = 100,
    k_provisional = 300,          -- ilk 10 oyun
    k_base = 160,
    k_mid = 100,                  -- 2000 üstü yavaşlar
    k_high = 60,                  -- 2400 üstü daha da yavaşlar
    mid_threshold = 2000,
    high_threshold = 2400
WHERE id = 1;

-- Klasik Elo beklentisi, ölçekli; fark max_diff ile sınırlanır
CREATE OR REPLACE FUNCTION public.elo_expected(p_ra NUMERIC, p_rb NUMERIC, p_max_diff NUMERIC, p_scale NUMERIC)
RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE
AS $$
  SELECT 1.0 / (1.0 + power(10.0, -(greatest(-p_max_diff, least(p_max_diff, p_ra - p_rb)))::double precision
                                   / p_scale::double precision));
$$;

-- Elo hesabı ölçekli beklentiyi ve tabanı kullanır; geri kalanı 008 ile aynı
CREATE OR REPLACE FUNCTION public.finish_game(p_game_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  g games%ROWTYPE;
  cfg rating_config%ROWTYPE;
  m okey_model%ROWTYPE;
  n INT;
  rno INT;
  i INT;
  j INT;
  ids UUID[];
  v_rating NUMERIC;
  v_games INT;
  rt NUMERIC[] := ARRAY[0,0,0,0];
  gp INT[] := ARRAY[0,0,0,0];
  k NUMERIC[] := ARRAY[0,0,0,0];
  delta NUMERIC[] := ARRAY[0,0,0,0];
  t NUMERIC[];
  o INT[];
  lk NUMERIC[] := ARRAY[0,0,0,0];
  skill NUMERIC[] := ARRAY[0,0,0,0];
  rawd NUMERIC[] := ARRAY[0,0,0,0];
  luck NUMERIC[] := ARRAY[0,0,0,0];
  fin NUMERIC[] := ARRAY[0,0,0,0];
  okeys INT[] := ARRAY[0,0,0,0];
  place INT[] := ARRAY[0,0,0,0];
  tm NUMERIC;
  lm NUMERIC;
  m1 NUMERIC;
  m2 NUMERIC;
  x1 NUMERIC;
  x2 NUMERIC;
  y NUMERIC;
  d11 NUMERIC := 0;
  d12 NUMERIC := 0;
  d22 NUMERIC := 0;
  dy1 NUMERIC := 0;
  dy2 NUMERIC := 0;
  a11 NUMERIC;
  a22 NUMERIC;
  b1 NUMERIC;
  b2 NUMERIC;
  det NUMERIC;
  s DOUBLE PRECISION;
  team_a DOUBLE PRECISION;
  team_e DOUBLE PRECISION;
  v_winner TEXT;
  v_result JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO g FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oyun bulunamadı'; END IF;
  IF g.status <> 'active' THEN RAISE EXCEPTION 'Oyun aktif değil (durum: %)', g.status; END IF;
  IF NOT can_write_game(g, v_uid) THEN RAISE EXCEPTION 'Bu oyunu bitiremezsin'; END IF;

  SELECT * INTO cfg FROM rating_config WHERE id = 1;
  SELECT count(*) INTO n FROM rounds WHERE game_id = p_game_id;
  IF n < 1 THEN RAISE EXCEPTION 'Hiç el oynanmamış'; END IF;
  IF g.is_ranked AND n < cfg.min_rounds_ranked THEN
    RAISE EXCEPTION 'Dereceli oyun en az % el sürmeli (oynanan: %)', cfg.min_rounds_ranked, n;
  END IF;

  -- Okey değerleri: bu oyundan ÖNCEKİ modelle
  SELECT * INTO m FROM okey_model ORDER BY id DESC LIMIT 1 FOR UPDATE;

  FOR rno IN SELECT round_no FROM rounds WHERE game_id = p_game_id ORDER BY round_no LOOP
    SELECT array_agg(total ORDER BY seat), array_agg(okey1::INT + okey2::INT ORDER BY seat)
    INTO t, o FROM round_scores WHERE game_id = p_game_id AND round_no = rno;

    tm := (t[1] + t[2] + t[3] + t[4]) / 4;
    m1 := 0;
    m2 := 0;
    FOR i IN 1..4 LOOP
      m1 := m1 + (o[i] = 1)::INT / 4.0;
      m2 := m2 + (o[i] = 2)::INT / 4.0;
      lk[i] := CASE o[i] WHEN 1 THEN m.okey1_value WHEN 2 THEN m.okey2_value ELSE 0 END;
    END LOOP;
    lm := (lk[1] + lk[2] + lk[3] + lk[4]) / 4;

    FOR i IN 1..4 LOOP
      y := tm - t[i];
      rawd[i] := rawd[i] + y;
      luck[i] := luck[i] + (lk[i] - lm);
      skill[i] := skill[i] + y - (lk[i] - lm);
      fin[i] := fin[i] + t[i];
      okeys[i] := okeys[i] + o[i];

      INSERT INTO round_skill (game_id, round_no, seat, table_mean, raw_diff, okey_luck, skill)
      VALUES (p_game_id, rno, i - 1, round(tm, 2), round(y, 2), round(lk[i] - lm, 2), round(y - (lk[i] - lm), 2));

      x1 := (o[i] = 1)::INT - m1;
      x2 := (o[i] = 2)::INT - m2;
      d11 := d11 + x1 * x1;
      d12 := d12 + x1 * x2;
      d22 := d22 + x2 * x2;
      dy1 := dy1 + x1 * y;
      dy2 := dy2 + x2 * y;
    END LOOP;
  END LOOP;

  -- Sıralama (düşük skor iyi) ve kazanan
  IF g.mode = 'single' THEN
    FOR i IN 1..4 LOOP
      place[i] := 1;
      FOR j IN 1..4 LOOP
        IF fin[j] < fin[i] THEN place[i] := place[i] + 1; END IF;
      END LOOP;
    END LOOP;
    SELECT string_agg(gpl.name, ', ' ORDER BY gpl.seat) INTO v_winner
    FROM game_players gpl WHERE gpl.game_id = p_game_id AND place[gpl.seat + 1] = 1;
  ELSE
    IF fin[1] + fin[3] < fin[2] + fin[4] THEN
      place := ARRAY[1, 2, 1, 2]; v_winner := g.team1_name;
    ELSIF fin[1] + fin[3] > fin[2] + fin[4] THEN
      place := ARRAY[2, 1, 2, 1]; v_winner := g.team2_name;
    ELSE
      place := ARRAY[1, 1, 1, 1]; v_winner := NULL;
    END IF;
  END IF;

  -- Elo (sadece dereceli)
  IF g.is_ranked THEN
    SELECT array_agg(user_id ORDER BY seat) INTO ids FROM game_players WHERE game_id = p_game_id;
    FOR i IN 1..4 LOOP
      INSERT INTO player_ratings (user_id, mode, rating) VALUES (ids[i], g.mode, cfg.start_rating)
      ON CONFLICT DO NOTHING;
      SELECT rating, games_played INTO v_rating, v_games
      FROM player_ratings WHERE user_id = ids[i] AND mode = g.mode FOR UPDATE;
      rt[i] := v_rating;
      gp[i] := v_games;
      k[i] := CASE
        WHEN gp[i] < cfg.provisional_games THEN cfg.k_provisional
        WHEN rt[i] >= cfg.high_threshold THEN cfg.k_high
        WHEN rt[i] >= cfg.mid_threshold THEN cfg.k_mid
        ELSE cfg.k_base
      END;
    END LOOP;

    IF g.mode = 'single' THEN
      -- Her oyuncu çifti ayrı bir maç; K üç maça bölünür
      FOR i IN 1..4 LOOP
        s := 0;
        FOR j IN 1..4 LOOP
          CONTINUE WHEN i = j;
          s := s + elo_result(skill[i] - skill[j], cfg.noise_single * sqrt(n::NUMERIC), cfg.result_curve)
                 - elo_expected(rt[i], rt[j], cfg.max_rating_diff, cfg.rating_scale);
        END LOOP;
        delta[i] := k[i] / 3 * s::NUMERIC;
      END LOOP;
    ELSE
      -- Takımlar tek maç; ortaklar aynı sonucu alır (kendi K'larıyla)
      team_a := elo_result((skill[1] + skill[3]) - (skill[2] + skill[4]), cfg.noise_group * sqrt(n::NUMERIC), cfg.result_curve);
      team_e := elo_expected((rt[1] + rt[3]) / 2, (rt[2] + rt[4]) / 2, cfg.max_rating_diff, cfg.rating_scale);
      delta[1] := k[1] * (team_a - team_e)::NUMERIC;
      delta[3] := k[3] * (team_a - team_e)::NUMERIC;
      delta[2] := k[2] * (team_e - team_a)::NUMERIC;
      delta[4] := k[4] * (team_e - team_a)::NUMERIC;
    END IF;

    -- Taban: puan rating_floor'un altına inmez (değişim buna göre kırpılır)
    FOR i IN 1..4 LOOP
      delta[i] := greatest(cfg.rating_floor, rt[i] + delta[i]) - rt[i];
    END LOOP;

    FOR i IN 1..4 LOOP
      UPDATE player_ratings
      SET rating = rt[i] + delta[i], games_played = gp[i] + 1, updated_at = now()
      WHERE user_id = ids[i] AND mode = g.mode;
    END LOOP;
  END IF;

  -- Oyun sonuçları
  FOR i IN 1..4 LOOP
    INSERT INTO game_results (game_id, seat, user_id, final_score, place, raw_diff, okey_luck, skill_score,
                              okey_count, okey_model_id, formula_version, rating_before, rating_after, k_factor)
    SELECT p_game_id, i - 1,
           CASE WHEN gpl.invite_status = 'accepted' THEN gpl.user_id END,
           fin[i], place[i], round(rawd[i], 2), round(luck[i], 2), round(skill[i], 2),
           okeys[i], m.id, cfg.formula_version,
           CASE WHEN g.is_ranked THEN rt[i] END,
           CASE WHEN g.is_ranked THEN rt[i] + delta[i] END,
           CASE WHEN g.is_ranked THEN k[i] END
    FROM game_players gpl WHERE gpl.game_id = p_game_id AND gpl.seat = i - 1;

    v_result := v_result || (
      SELECT jsonb_build_object(
        'seat', i - 1, 'name', gpl.name, 'user_id', gpl.user_id,
        'final_score', fin[i], 'place', place[i], 'okey_count', okeys[i],
        'raw_diff', round(rawd[i]), 'okey_luck', round(luck[i]), 'skill_score', round(skill[i]),
        'rating_before', CASE WHEN g.is_ranked THEN round(rt[i]) END,
        'rating_after', CASE WHEN g.is_ranked THEN round(rt[i] + delta[i]) END,
        'rating_delta', CASE WHEN g.is_ranked THEN round(delta[i], 1) END)
      FROM game_players gpl WHERE gpl.game_id = p_game_id AND gpl.seat = i - 1);
  END LOOP;

  -- Okey modelini bu oyunun elleriyle güncelle (yeni sürüm)
  IF n >= cfg.min_rounds_learning AND (g.is_ranked OR cfg.learn_from_unranked) THEN
    a11 := m.xtx11 + d11 + cfg.okey1_prior_weight;
    a22 := m.xtx22 + d22 + cfg.okey2_prior_weight;
    b1 := m.xty1 + dy1 + cfg.okey1_prior_weight * cfg.okey1_prior;
    b2 := m.xty2 + dy2 + cfg.okey2_prior_weight * cfg.okey2_prior;
    det := a11 * a22 - (m.xtx12 + d12) * (m.xtx12 + d12);
    INSERT INTO okey_model (source_game_id, xtx11, xtx12, xtx22, xty1, xty2, rounds_count, okey1_value, okey2_value)
    VALUES (p_game_id, m.xtx11 + d11, m.xtx12 + d12, m.xtx22 + d22, m.xty1 + dy1, m.xty2 + dy2,
            m.rounds_count + n,
            round((b1 * a22 - (m.xtx12 + d12) * b2) / det, 2),
            round((a11 * b2 - (m.xtx12 + d12) * b1) / det, 2));
  END IF;

  UPDATE games
  SET status = 'finished', ended_at = now(), ended_by = v_uid, end_reason = 'completed',
      round_count = n, winner_label = v_winner
  WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'winner', v_winner,
    'okey_values', jsonb_build_object('single', m.okey1_value, 'double', m.okey2_value),
    'players', v_result
  );
END;
$$;

DROP FUNCTION public.elo_expected(NUMERIC, NUMERIC, NUMERIC);
REVOKE EXECUTE ON FUNCTION public.elo_expected(NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.elo_expected(NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated;

-- ── 4. Oyuncu istatistikleri ────────────────────────────────────────────────
-- Sadece bitmiş ve oyuncunun onayladığı oyunlar sayılır. Mod (tekli/grup) bazında.

CREATE OR REPLACE FUNCTION public.get_player_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH my_games AS (
    SELECT g.id, g.mode, g.is_ranked, g.ended_at, g.round_count, gp.seat
    FROM game_players gp
    JOIN games g ON g.id = gp.game_id
    WHERE gp.user_id = p_user_id AND gp.invite_status = 'accepted' AND g.status = 'finished'
  ),
  my_rounds AS (
    SELECT mg.mode, rs.total, rs.points, rs.individual_penalty,
           rs.okey1::INT + rs.okey2::INT AS okeys, rs.finished, rs.hand_finished, sk.skill,
           EXISTS (SELECT 1 FROM round_scores x
                   WHERE x.game_id = rs.game_id AND x.round_no = rs.round_no AND x.hand_finished) AS round_hand
    FROM my_games mg
    JOIN round_scores rs ON rs.game_id = mg.id AND rs.seat = mg.seat
    LEFT JOIN round_skill sk ON sk.game_id = rs.game_id AND sk.round_no = rs.round_no AND sk.seat = rs.seat
  ),
  round_stats AS (
    SELECT mode,
           count(*) AS rounds,
           round(avg(total), 1) AS avg_round_score,
           round(avg(okeys), 2) AS okey_per_round,
           round(100.0 * avg(finished::INT), 1) AS finish_pct,
           count(*) FILTER (WHERE hand_finished) AS hand_finishes,
           -- Elden bitirilen ellerde kimin açtığı bilinmez; açamama oranı diğer ellerden
           round(100.0 * count(*) FILTER (WHERE NOT round_hand AND points = 202)
                 / nullif(count(*) FILTER (WHERE NOT round_hand), 0), 1) AS not_opened_pct,
           round(avg(CASE WHEN round_hand THEN 0 ELSE individual_penalty / 101 END), 2) AS penalty_per_round,
           round(avg(skill), 1) AS skill_per_round
    FROM my_rounds
    GROUP BY mode
  ),
  game_stats AS (
    SELECT mg.mode,
           count(*) AS games,
           count(*) FILTER (WHERE mg.is_ranked) AS ranked_games,
           count(*) FILTER (WHERE gr.place = 1) AS wins,
           round(avg(gr.place), 2) AS avg_place,
           round(avg(gr.final_score), 1) AS avg_game_score,
           round(avg(gr.skill_score), 1) AS skill_per_game
    FROM my_games mg
    JOIN game_results gr ON gr.game_id = mg.id AND gr.seat = mg.seat
    GROUP BY mg.mode
  )
  SELECT jsonb_build_object(
    'user_id', p.id,
    'display_name', p.display_name,
    'modes', coalesce((
      SELECT jsonb_object_agg(gs.mode,
               (to_jsonb(gs) - 'mode') || coalesce(to_jsonb(rst) - 'mode', '{}'::jsonb)
               || jsonb_build_object('rating', round(r.rating), 'rated_games', r.games_played))
      FROM game_stats gs
      LEFT JOIN round_stats rst ON rst.mode = gs.mode
      LEFT JOIN player_ratings r ON r.user_id = p.id AND r.mode = gs.mode), '{}'::jsonb),
    'recent', coalesce((
      SELECT jsonb_agg(x ORDER BY x.ended_at DESC)
      FROM (SELECT mg.id AS game_id, mg.mode, mg.is_ranked, mg.ended_at, mg.round_count,
                   gr.place, gr.final_score, round(gr.skill_score) AS skill,
                   round(gr.rating_after - gr.rating_before, 1) AS rating_delta
            FROM my_games mg
            JOIN game_results gr ON gr.game_id = mg.id AND gr.seat = mg.seat
            ORDER BY mg.ended_at DESC
            LIMIT 10) x), '[]'::jsonb))
  FROM profiles p
  WHERE p.id = p_user_id AND p.deleted_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_player_stats(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_stats(UUID) TO anon, authenticated;
