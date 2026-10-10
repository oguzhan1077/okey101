-- ════════════════════════════════════════════════════════════════════════════
-- 012 — Güvenlik: okey modeli zehirlenmesi, misafir oyunu yazma, oyun gizliliği
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. Okey değeri sadece DERECELİ oyunlardan öğrenilir. Giriş gerektirmeyen derecesiz/misafir
--    oyunlarla sahte veri sokulup dereceli Elo'nun kullandığı okey değeri bozulabiliyordu.
-- 2. Misafir (hesapsız kurulan) oyuna sadece kuran cihaz yazabilir/bitirebilir. Oyunlar
--    herkese açık listelenebildiği için başkası misafir oyunlarının ellerini değiştirebiliyordu.
--    Cihaz kimliği (games.device_id) dışarıdan okunamaz.
-- 3. Oyun verisi gizli: oyun tablolarına doğrudan okuma kapatıldı. Bir oyunu sadece oyuncuları
--    (davetliler dahil), kuranı ve (misafir oyununda) kuran cihaz görür: get_game().
--    Sıralama ve toplu istatistikler açık kalır. Başkasının profilinde son 5 oyun özeti
--    (tarihsiz, rakipsiz); sadece birlikte oynanan oyun açılabilir.
-- 4. Artık kullanılmayan list_players ve get_leaderboard kaldırıldı.

-- ── 1. Okey modeli sadece dereceli oyunlardan ───────────────────────────────

UPDATE rating_config SET learn_from_unranked = false WHERE id = 1;

-- ── 2. Yetki: cihaz kimliği ─────────────────────────────────────────────────

-- Yazma: kuran hesap; hesapsız kurulan derecesiz oyunda sadece kuran cihaz
CREATE OR REPLACE FUNCTION public.can_write_game(p_game games, p_uid UUID, p_device TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(p_game.created_by = p_uid, false)
      OR (p_game.created_by IS NULL AND NOT p_game.is_ranked
          AND p_device IS NOT NULL AND p_game.device_id IS NOT NULL AND p_game.device_id = p_device);
$$;

-- Görme: oyuncular (davetliler dahil), kuran; misafir oyununda kuran cihaz
CREATE OR REPLACE FUNCTION public.can_view_game(p_game games, p_uid UUID, p_device TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(p_game.created_by = p_uid, false)
      OR (p_uid IS NOT NULL AND EXISTS (SELECT 1 FROM game_players WHERE game_id = p_game.id AND user_id = p_uid))
      OR (p_game.created_by IS NULL AND p_device IS NOT NULL AND p_game.device_id = p_device);
$$;

CREATE OR REPLACE FUNCTION public.create_game(
  p_mode TEXT,
  p_is_ranked BOOLEAN,
  p_players JSONB,
  p_first_dealer_seat SMALLINT DEFAULT 0,
  p_team1_name TEXT DEFAULT NULL,
  p_team2_name TEXT DEFAULT NULL,
  p_meta JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_game_id UUID;
  v_rules JSONB;
  v_user UUID;
  v_guest TEXT;
  v_name TEXT;
  v_creator_in BOOLEAN := false;
  i INT;
BEGIN
  IF p_mode NOT IN ('single', 'group') THEN RAISE EXCEPTION 'Geçersiz oyun modu'; END IF;
  IF jsonb_typeof(p_players) <> 'array' OR jsonb_array_length(p_players) <> 4 THEN
    RAISE EXCEPTION '4 oyuncu gerekli';
  END IF;
  IF p_first_dealer_seat NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'Geçersiz dağıtan koltuk'; END IF;
  IF p_mode = 'group' AND (nullif(trim(p_team1_name), '') IS NULL OR nullif(trim(p_team2_name), '') IS NULL) THEN
    RAISE EXCEPTION 'Grup oyununda takım adları gerekli';
  END IF;
  IF p_is_ranked AND v_uid IS NULL THEN RAISE EXCEPTION 'Dereceli oyun için giriş yapmalısın'; END IF;

  SELECT rules INTO v_rules FROM rating_config WHERE id = 1;

  p_meta := CASE WHEN jsonb_typeof(p_meta) = 'object' THEN p_meta ELSE '{}' END;
  -- Misafir oyununa sadece kuran cihaz yazabilir; cihaz kimliği şart
  IF v_uid IS NULL AND meta_text(p_meta, 'device_id', 64) IS NULL THEN
    RAISE EXCEPTION 'Cihaz kimliği alınamadı; tarayıcı depolamasına izin verin veya giriş yapın';
  END IF;

  INSERT INTO games (mode, is_ranked, status, created_by, team1_name, team2_name, first_dealer_seat, rules, started_at,
                     setup_started_at, client_created_at, client_timezone, device_id, app_version, client_meta)
  VALUES (p_mode, p_is_ranked,
          CASE WHEN p_is_ranked THEN 'pending' ELSE 'active' END,
          v_uid,
          CASE WHEN p_mode = 'group' THEN trim(p_team1_name) END,
          CASE WHEN p_mode = 'group' THEN trim(p_team2_name) END,
          p_first_dealer_seat, v_rules,
          CASE WHEN p_is_ranked THEN NULL ELSE now() END,
          meta_time(p_meta, 'setup_started_at'), meta_time(p_meta, 'client_created_at'),
          meta_text(p_meta, 'timezone', 64), meta_text(p_meta, 'device_id', 64), meta_text(p_meta, 'app_version', 40),
          -- Kalan küçük alanlar (tarayıcı, ekran, dil); boyut sınırlı
          CASE WHEN length((p_meta - 'setup_started_at' - 'client_created_at' - 'timezone' - 'device_id' - 'app_version')::TEXT) <= 2000
               THEN p_meta - 'setup_started_at' - 'client_created_at' - 'timezone' - 'device_id' - 'app_version'
               ELSE '{}' END)
  RETURNING id INTO v_game_id;

  FOR i IN 0..3 LOOP
    v_user := nullif(p_players -> i ->> 'user_id', '')::UUID;
    v_guest := nullif(trim(regexp_replace(p_players -> i ->> 'guest_name', '\s+', ' ', 'g')), '');

    IF v_user IS NOT NULL THEN
      SELECT display_name INTO v_name FROM profiles
      WHERE id = v_user AND display_name IS NOT NULL AND deleted_at IS NULL;
      IF v_name IS NULL THEN RAISE EXCEPTION '%. oyuncunun hesabı veya görünen adı yok', i + 1; END IF;
      IF v_user = v_uid THEN v_creator_in := true; END IF;
    ELSIF p_is_ranked THEN
      RAISE EXCEPTION 'Dereceli oyunda 4 oyuncunun da hesabı olmalı';
    ELSIF v_guest IS NULL OR length(v_guest) > 20 THEN
      RAISE EXCEPTION '%. oyuncunun adı geçersiz', i + 1;
    ELSE
      v_name := v_guest;
    END IF;

    INSERT INTO game_players (game_id, seat, team, user_id, name, invite_status, responded_at)
    VALUES (v_game_id, i,
            CASE WHEN p_mode = 'group' THEN (i % 2) + 1 END,
            v_user, v_name,
            CASE WHEN v_user IS NULL THEN 'guest'
                 WHEN v_user = v_uid THEN 'accepted'
                 ELSE 'pending' END,
            CASE WHEN v_user = v_uid THEN now() END);
  END LOOP;
  -- Aynı hesap iki koltukta: game_players UNIQUE (game_id, user_id) hata verir

  IF p_is_ranked AND NOT v_creator_in THEN
    RAISE EXCEPTION 'Oyunu kuran kişi de oyuncular arasında olmalı';
  END IF;

  -- Masada aynı adda iki kişi varsa (ör. iki Oğuzhan) hesaplıların adına etiket eklenir
  UPDATE game_players gp
  SET name = gp.name || ' #' || lpad(p.tag::TEXT, 4, '0')
  FROM profiles p
  WHERE gp.game_id = v_game_id AND p.id = gp.user_id
    AND (SELECT count(*) FROM game_players x
         WHERE x.game_id = v_game_id AND name_key(x.name) = name_key(gp.name)) > 1;

  RETURN v_game_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_round(
  p_game_id UUID,
  p_round_no INTEGER,
  p_dealer_seat SMALLINT,
  p_scores JSONB,
  p_client_time TIMESTAMPTZ DEFAULT NULL,
  p_meta JSONB DEFAULT '{}',
  p_base_revision INTEGER DEFAULT NULL
)
RETURNS INTEGER  -- elin revizyon numarası
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  g games%ROWTYPE;
  v_rules JSONB;
  v_last INT;
  v_existing rounds%ROWTYPE;
  v_old JSONB;
  v_new JSONB := '[]'::jsonb;
  s JSONB;
  v_points NUMERIC;
  v_ind NUMERIC;
  v_team NUMERIC;
  v_fin BOOLEAN;
  v_hand BOOLEAN;
  v_total NUMERIC;
  v_expected NUMERIC;
  i INT;
BEGIN
  p_meta := CASE WHEN jsonb_typeof(p_meta) = 'object' THEN p_meta ELSE '{}' END;
  SELECT * INTO g FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oyun bulunamadı'; END IF;
  IF g.status <> 'active' THEN RAISE EXCEPTION 'Oyun aktif değil (durum: %)', g.status; END IF;
  IF NOT can_write_game(g, v_uid, meta_text(p_meta, 'device_id', 64)) THEN RAISE EXCEPTION 'Bu oyuna el yazamazsın'; END IF;
  IF p_dealer_seat IS NOT NULL AND p_dealer_seat NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'Geçersiz dağıtan koltuk'; END IF;
  IF jsonb_typeof(p_scores) <> 'array' OR jsonb_array_length(p_scores) <> 4 THEN
    RAISE EXCEPTION 'Elde 4 oyuncu skoru olmalı';
  END IF;

  v_rules := g.rules;
  p_meta := CASE WHEN jsonb_typeof(p_meta) = 'object' THEN p_meta ELSE '{}' END;

  -- Doğrula ve normalize et
  FOR i IN 0..3 LOOP
    s := p_scores -> i;
    v_points := (s ->> 'points')::NUMERIC;
    v_ind := coalesce((s ->> 'individual_penalty')::NUMERIC, 0);
    v_team := coalesce((s ->> 'team_penalty')::NUMERIC, 0);
    v_fin := coalesce((s ->> 'finished')::BOOLEAN, false);
    v_hand := coalesce((s ->> 'hand_finished')::BOOLEAN, false);
    v_total := (s ->> 'total')::NUMERIC;
    IF v_points IS NULL OR v_total IS NULL THEN RAISE EXCEPTION '%. koltuğun skoru eksik', i + 1; END IF;
    IF abs(v_points) > 2000 OR v_ind < 0 OR v_team < 0 OR v_ind > 5000 OR v_team > 5000 THEN
      RAISE EXCEPTION '%. koltuğun skoru geçersiz', i + 1;
    END IF;
    IF v_hand AND NOT v_fin THEN RAISE EXCEPTION 'Elden bitiren aynı zamanda bitirmiş olmalı'; END IF;
    IF g.mode = 'single' AND v_team <> 0 THEN RAISE EXCEPTION 'Tekli oyunda takım cezası olmaz'; END IF;

    v_expected := v_points + v_ind + v_team
                  - CASE WHEN v_fin AND NOT v_hand THEN (v_rules ->> 'finish_bonus')::NUMERIC ELSE 0 END;
    IF abs(v_expected - v_total) > 0.01 THEN
      RAISE EXCEPTION '%. koltuğun toplamı kurallara uymuyor (beklenen %, gelen %)', i + 1, v_expected, v_total;
    END IF;

    v_new := v_new || jsonb_build_object(
      'seat', i, 'points', v_points, 'individual_penalty', v_ind, 'team_penalty', v_team,
      'okey1', coalesce((s ->> 'okey1')::BOOLEAN, false), 'okey2', coalesce((s ->> 'okey2')::BOOLEAN, false),
      'finished', v_fin, 'hand_finished', v_hand, 'total', v_total);
  END LOOP;

  SELECT coalesce(max(round_no), 0) INTO v_last FROM rounds WHERE game_id = p_game_id;

  IF p_round_no = v_last + 1 THEN
    IF p_base_revision IS NOT NULL AND p_base_revision <> 0 THEN
      RAISE EXCEPTION 'ROUND_CONFLICT: % numaralı el bulunamadı', p_round_no;
    END IF;
    INSERT INTO rounds (game_id, round_no, dealer_seat, entered_by, client_entered_at,
                        client_started_at, device_id, app_version)
    VALUES (p_game_id, p_round_no, p_dealer_seat, v_uid, p_client_time,
            meta_time(p_meta, 'client_started_at'), meta_text(p_meta, 'device_id', 64), meta_text(p_meta, 'app_version', 40));
    INSERT INTO round_scores (game_id, round_no, seat, points, individual_penalty, team_penalty,
                              okey1, okey2, finished, hand_finished, total)
    SELECT p_game_id, p_round_no, (x ->> 'seat')::SMALLINT, (x ->> 'points')::NUMERIC,
           (x ->> 'individual_penalty')::NUMERIC, (x ->> 'team_penalty')::NUMERIC,
           (x ->> 'okey1')::BOOLEAN, (x ->> 'okey2')::BOOLEAN, (x ->> 'finished')::BOOLEAN,
           (x ->> 'hand_finished')::BOOLEAN, (x ->> 'total')::NUMERIC
    FROM jsonb_array_elements(v_new) x;
    UPDATE games SET round_count = p_round_no WHERE id = p_game_id;
    RETURN 1;
  ELSIF p_round_no BETWEEN 1 AND v_last THEN
    SELECT * INTO v_existing FROM rounds WHERE game_id = p_game_id AND round_no = p_round_no FOR UPDATE;
    SELECT jsonb_agg(jsonb_build_object(
             'seat', seat, 'points', points, 'individual_penalty', individual_penalty, 'team_penalty', team_penalty,
             'okey1', okey1, 'okey2', okey2, 'finished', finished, 'hand_finished', hand_finished, 'total', total)
           ORDER BY seat)
    INTO v_old FROM round_scores WHERE game_id = p_game_id AND round_no = p_round_no;

    -- Aynı içerik: tekrar gönderim, değişiklik yok
    IF v_old = v_new AND v_existing.dealer_seat IS NOT DISTINCT FROM p_dealer_seat THEN
      RETURN v_existing.revision;
    END IF;
    IF p_base_revision IS NOT NULL AND p_base_revision <> v_existing.revision THEN
      RAISE EXCEPTION 'ROUND_CONFLICT: % numaralı el başka bir cihazdan kaydedilmiş', p_round_no;
    END IF;

    INSERT INTO round_revisions (game_id, round_no, revision, dealer_seat, scores, changed_by, client_changed_at, device_id)
    VALUES (p_game_id, p_round_no, v_existing.revision, v_existing.dealer_seat, v_old, v_uid,
            p_client_time, meta_text(p_meta, 'device_id', 64));

    DELETE FROM round_scores WHERE game_id = p_game_id AND round_no = p_round_no;
    INSERT INTO round_scores (game_id, round_no, seat, points, individual_penalty, team_penalty,
                              okey1, okey2, finished, hand_finished, total)
    SELECT p_game_id, p_round_no, (x ->> 'seat')::SMALLINT, (x ->> 'points')::NUMERIC,
           (x ->> 'individual_penalty')::NUMERIC, (x ->> 'team_penalty')::NUMERIC,
           (x ->> 'okey1')::BOOLEAN, (x ->> 'okey2')::BOOLEAN, (x ->> 'finished')::BOOLEAN,
           (x ->> 'hand_finished')::BOOLEAN, (x ->> 'total')::NUMERIC
    FROM jsonb_array_elements(v_new) x;
    UPDATE rounds SET dealer_seat = p_dealer_seat, revision = revision + 1, updated_at = now()
    WHERE game_id = p_game_id AND round_no = p_round_no;
    RETURN v_existing.revision + 1;
  ELSE
    RAISE EXCEPTION 'El numarası sırada değil (son el: %, gelen: %)', v_last, p_round_no;
  END IF;
END;
$$;

DROP FUNCTION public.finish_game(UUID);
CREATE FUNCTION public.finish_game(p_game_id UUID, p_device_id TEXT DEFAULT NULL)
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
  IF NOT can_write_game(g, v_uid, p_device_id) THEN RAISE EXCEPTION 'Bu oyunu bitiremezsin'; END IF;

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

DROP FUNCTION public.end_game_early(UUID);
CREATE FUNCTION public.end_game_early(p_game_id UUID, p_device_id TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  g games%ROWTYPE;
BEGIN
  SELECT * INTO g FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oyun bulunamadı'; END IF;
  IF NOT can_write_game(g, v_uid, p_device_id) THEN RAISE EXCEPTION 'Oyunu sadece kuran kişi iptal edebilir'; END IF;

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

DROP FUNCTION public.can_write_game(games, UUID);

-- ── 3. Oyun verisi gizli ────────────────────────────────────────────────────

-- Oyunun tamamı tek seferde; görme yetkisi yoksa NULL (oyunun var olup olmadığı da sızmaz).
-- Onay bekleyen oyunda süresi dolan davetler önce kapatılır.
CREATE OR REPLACE FUNCTION public.get_game(p_game_id UUID, p_device_id TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  g games%ROWTYPE;
  v_timeout INTEGER;
BEGIN
  SELECT * INTO g FROM games WHERE id = p_game_id;
  IF NOT FOUND OR NOT can_view_game(g, auth.uid(), p_device_id) THEN RETURN NULL; END IF;

  SELECT invite_timeout_minutes INTO v_timeout FROM rating_config WHERE id = 1;
  IF g.status = 'pending' AND g.created_at < now() - make_interval(mins => v_timeout) THEN
    PERFORM expire_pending_invites();
    SELECT * INTO g FROM games WHERE id = p_game_id;
  END IF;

  RETURN jsonb_build_object(
    'game', jsonb_build_object(
      'id', g.id, 'mode', g.mode, 'is_ranked', g.is_ranked, 'status', g.status, 'created_by', g.created_by,
      'team1_name', g.team1_name, 'team2_name', g.team2_name, 'first_dealer_seat', g.first_dealer_seat,
      'round_count', g.round_count, 'started_at', g.started_at, 'winner_label', g.winner_label,
      'created_at', g.created_at, 'end_reason', g.end_reason,
      'invite_expires_at', CASE WHEN g.status = 'pending' THEN g.created_at + make_interval(mins => v_timeout) END),
    'players', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'seat', seat, 'team', team, 'user_id', user_id, 'name', name, 'invite_status', invite_status) ORDER BY seat)
      FROM game_players WHERE game_id = g.id), '[]'::jsonb),
    'rounds', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'round_no', round_no, 'dealer_seat', dealer_seat, 'revision', revision) ORDER BY round_no)
      FROM rounds WHERE game_id = g.id), '[]'::jsonb),
    'scores', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'round_no', round_no, 'seat', seat, 'points', points, 'individual_penalty', individual_penalty,
        'team_penalty', team_penalty, 'okey1', okey1, 'okey2', okey2, 'finished', finished,
        'hand_finished', hand_finished, 'total', total) ORDER BY round_no, seat)
      FROM round_scores WHERE game_id = g.id), '[]'::jsonb),
    'results', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'seat', seat, 'final_score', final_score, 'place', place, 'okey_count', okey_count,
        'raw_diff', raw_diff, 'okey_luck', okey_luck, 'skill_score', skill_score,
        'rating_before', rating_before, 'rating_after', rating_after) ORDER BY seat)
      FROM game_results WHERE game_id = g.id), '[]'::jsonb)
  );
END;
$$;

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
  -- Genel ortalama: bu moddaki tüm bitmiş oyunların tüm oyuncuları (misafirler dahil)
  all_rounds AS (
    SELECT g.mode, rs.total, rs.points, rs.individual_penalty,
           rs.okey1::INT + rs.okey2::INT AS okeys, rs.finished,
           hf.game_id IS NOT NULL AS round_hand
    FROM round_scores rs
    JOIN games g ON g.id = rs.game_id
    LEFT JOIN round_scores hf ON hf.game_id = rs.game_id AND hf.round_no = rs.round_no AND hf.hand_finished
    WHERE g.status = 'finished' AND g.mode IN (SELECT DISTINCT mode FROM my_games)
  ),
  baseline_rounds AS (
    SELECT mode,
           round(avg(total), 1) AS avg_round_score,
           round(avg(okeys), 2) AS okey_per_round,
           round(100.0 * avg(finished::INT), 1) AS finish_pct,
           round(100.0 * count(*) FILTER (WHERE NOT round_hand AND points = 202)
                 / nullif(count(*) FILTER (WHERE NOT round_hand), 0), 1) AS not_opened_pct,
           round(avg(CASE WHEN round_hand THEN 0 ELSE individual_penalty / 101 END), 2) AS penalty_per_round
    FROM all_rounds
    GROUP BY mode
  ),
  baseline_games AS (
    SELECT g.mode,
           round(avg(gr.final_score), 1) AS avg_game_score,
           round(100.0 * avg((gr.place = 1)::INT), 1) AS win_pct
    FROM game_results gr
    JOIN games g ON g.id = gr.game_id
    WHERE g.status = 'finished' AND g.mode IN (SELECT DISTINCT mode FROM my_games)
    GROUP BY g.mode
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
    'tag', p.tag,
    'badge', p.badge,
    'modes', coalesce((
      SELECT jsonb_object_agg(gs.mode,
               (to_jsonb(gs) - 'mode') || coalesce(to_jsonb(rst) - 'mode', '{}'::jsonb)
               || jsonb_build_object('rating', round(r.rating), 'rated_games', r.games_played))
      FROM game_stats gs
      LEFT JOIN round_stats rst ON rst.mode = gs.mode
      LEFT JOIN player_ratings r ON r.user_id = p.id AND r.mode = gs.mode), '{}'::jsonb),
    'baseline', coalesce((
      SELECT jsonb_object_agg(br.mode, (to_jsonb(br) - 'mode') || coalesce(to_jsonb(bg) - 'mode', '{}'::jsonb))
      FROM baseline_rounds br
      LEFT JOIN baseline_games bg ON bg.mode = br.mode), '{}'::jsonb),
    -- Son oyunlar, her mod için ayrı:
    --   kendisi: son 10, tarihli, hepsi açılabilir
    --   başkası: son 5 özet (sıra, puan, beceri, Elo); tarih ve rakip yok. Sadece birlikte
    --   oynanan oyun açılabilir (game_id sadece onlarda döner). Kim kiminle ne zaman: gizli.
    'recent', coalesce((
      SELECT jsonb_agg(to_jsonb(x) - 'ord' - 'is_self' ORDER BY x.mode, x.ord)
      FROM (SELECT CASE WHEN v.can_open THEN mg.id END AS game_id,
                   mg.mode, mg.is_ranked,
                   CASE WHEN v.is_self THEN mg.ended_at END AS ended_at,
                   mg.round_count, gr.place, gr.final_score, round(gr.skill_score) AS skill,
                   round(gr.rating_after - gr.rating_before, 1) AS rating_delta,
                   v.can_open,
                   row_number() OVER (PARTITION BY mg.mode ORDER BY mg.ended_at DESC) AS ord,
                   v.is_self
            FROM my_games mg
            JOIN game_results gr ON gr.game_id = mg.id AND gr.seat = mg.seat
            CROSS JOIN LATERAL (
              SELECT auth.uid() = p_user_id IS TRUE AS is_self,
                     (auth.uid() = p_user_id IS TRUE)
                     OR EXISTS (SELECT 1 FROM game_players gp2
                                WHERE gp2.game_id = mg.id AND gp2.user_id = auth.uid()) AS can_open
            ) v
           ) x
      WHERE x.ord <= CASE WHEN x.is_self THEN 10 ELSE 5 END), '[]'::jsonb))
  FROM profiles p
  WHERE p.id = p_user_id AND p.deleted_at IS NULL;
$$;

-- Doğrudan okuma kapanır (sütun yetkileri de birlikte kalkar)
REVOKE ALL ON games, game_players, rounds, round_scores, round_revisions, game_results, round_skill
  FROM anon, authenticated;

-- ── 4. Kullanılmayan eski fonksiyonlar ──────────────────────────────────────

DROP FUNCTION IF EXISTS public.list_players();
DROP FUNCTION IF EXISTS public.get_leaderboard(TEXT);

-- ── İzinler ─────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION
  public.can_write_game(games, UUID, TEXT),
  public.can_view_game(games, UUID, TEXT),
  public.finish_game(UUID, TEXT),
  public.end_game_early(UUID, TEXT),
  public.get_game(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_game(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_game_early(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_game(UUID, TEXT) TO anon, authenticated;
