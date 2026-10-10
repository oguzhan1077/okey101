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
-- 5. Davetler 5 dakikada yanıtlanmazsa süresi dolar (expired); dereceli oyun iptal olur.
-- 6. Oyuncu arama sunucuda (en fazla 5 öneri), sıralama sayfalı (10'ar).
-- 0. Kullanıcı etiketi: aynı adı birden çok kişi alabilir, 'Oğuzhan #1889' gibi
--    4 haneli etiketle ayrılır. Benzersizlik = ad (Türkçe harf duyarsız) + etiket.

-- ── 0. Kullanıcı etiketi (#1234) ────────────────────────────────────────────
-- Görünen ad artık benzersiz değil; ad + 4 haneli etiket benzersiz. Etiket kayıtta rastgele
-- verilir, ad değişince mümkünse korunur. Masada sadece ad görünür; arama, sıralama, profil
-- ve davetlerde etiketle birlikte gösterilir.

-- Türkçe büyük/küçük harf duyarsız karşılaştırma anahtarı (İ→i, I→ı)
CREATE OR REPLACE FUNCTION public.name_key(p TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT lower(translate(trim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), 'İIĞÜŞÖÇ', 'iığüşöç'));
$$;

ALTER TABLE profiles ADD COLUMN tag SMALLINT CHECK (tag BETWEEN 0 AND 9999);
COMMENT ON COLUMN profiles.tag IS 'Aynı adı taşıyanları ayıran 4 haneli etiket: Oğuzhan #1889';

-- Bu ad için boştaki rastgele bir etiket
CREATE OR REPLACE FUNCTION public.free_tag(p_name TEXT, p_except UUID DEFAULT NULL)
RETURNS SMALLINT
LANGUAGE plpgsql VOLATILE SET search_path = public
AS $$
DECLARE
  v_tag SMALLINT;
  i INT;
BEGIN
  FOR i IN 1..200 LOOP
    v_tag := floor(random() * 10000)::SMALLINT;
    IF NOT EXISTS (SELECT 1 FROM profiles
                   WHERE name_key(display_name) = name_key(p_name) AND tag = v_tag
                     AND (p_except IS NULL OR id <> p_except)) THEN
      RETURN v_tag;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Bu ad için boş etiket bulunamadı, başka bir ad deneyin';
END;
$$;

-- Mevcut hesaplara etiket
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, display_name FROM profiles WHERE display_name IS NOT NULL ORDER BY created_at LOOP
    UPDATE profiles SET tag = free_tag(r.display_name, r.id) WHERE id = r.id;
  END LOOP;
END $$;

DROP INDEX profiles_display_name_unique;
CREATE UNIQUE INDEX profiles_name_tag_unique ON profiles (name_key(display_name), tag) WHERE display_name IS NOT NULL;
ALTER TABLE profiles ADD CONSTRAINT profiles_name_has_tag CHECK (display_name IS NULL OR tag IS NOT NULL);

-- Kayıt: ad geçerliyse etiketle birlikte yazılır (ad artık "alınmış" olamaz)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name TEXT := nullif(trim(regexp_replace(NEW.raw_user_meta_data ->> 'display_name', '\s+', ' ', 'g')), '');
  i INT;
BEGIN
  IF NOT valid_display_name(v_name) THEN v_name := NULL; END IF;
  FOR i IN 1..5 LOOP  -- aynı anda aynı ad + etiket gelirse tekrar dene
    BEGIN
      INSERT INTO profiles (id, display_name, tag)
      VALUES (NEW.id, v_name, CASE WHEN v_name IS NOT NULL THEN free_tag(v_name) END)
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
  INSERT INTO profiles (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Görünen adı belirle/değiştir: 'ok' | 'invalid'. Etiket, yeni adla çakışmıyorsa korunur.
CREATE OR REPLACE FUNCTION public.set_display_name(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_name TEXT := trim(regexp_replace(p_name, '\s+', ' ', 'g'));
  v_tag SMALLINT;
  i INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısın'; END IF;
  IF NOT valid_display_name(v_name) THEN RETURN 'invalid'; END IF;
  SELECT tag INTO v_tag FROM profiles WHERE id = v_uid;
  IF v_tag IS NULL OR EXISTS (SELECT 1 FROM profiles
                              WHERE name_key(display_name) = name_key(v_name) AND tag = v_tag AND id <> v_uid) THEN
    v_tag := free_tag(v_name, v_uid);
  END IF;
  FOR i IN 1..5 LOOP
    BEGIN
      INSERT INTO profiles (id, display_name, tag) VALUES (v_uid, v_name, v_tag)
      ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, tag = EXCLUDED.tag, updated_at = now();
      RETURN 'ok';
    EXCEPTION WHEN unique_violation THEN
      v_tag := free_tag(v_name, v_uid);
    END;
  END LOOP;
  RAISE EXCEPTION 'Görünen ad kaydedilemedi, tekrar deneyin';
END;
$$;

-- Ad artık her zaman alınabilir (etiket ayırır); eski arayüz uyumluluğu için duruyor
CREATE OR REPLACE FUNCTION public.is_display_name_available(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT true;
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

REVOKE EXECUTE ON FUNCTION public.name_key(TEXT), public.free_tag(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.name_key(TEXT) TO anon, authenticated;

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
    'tag', p.tag,
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

-- ── 5. Davet süresi ─────────────────────────────────────────────────────────
-- Davet invite_timeout_minutes içinde yanıtlanmazsa 'expired' olur ("reddetti"den ayrı tutulur).
-- Dereceli oyunda süresi dolan tek davet bile oyunu iptal eder (end_reason = 'expired').
-- Derecesiz oyun beklemediği için devam eder; sadece o davet kapanır.
-- Zamanlanmış görev yok: süresi dolanlar, davet/oyun okunurken veya yanıtlanırken kapatılır.

ALTER TABLE rating_config ADD COLUMN invite_timeout_minutes INTEGER NOT NULL DEFAULT 5;

ALTER TABLE game_players DROP CONSTRAINT game_players_invite_status_check;
ALTER TABLE game_players ADD CONSTRAINT game_players_invite_status_check
  CHECK (invite_status IN ('accepted', 'pending', 'declined', 'guest', 'expired'));
ALTER TABLE games DROP CONSTRAINT games_end_reason_check;
ALTER TABLE games ADD CONSTRAINT games_end_reason_check
  CHECK (end_reason IN ('completed', 'abandoned', 'declined', 'cancelled', 'expired'));

COMMENT ON COLUMN game_players.invite_status IS
  'accepted: onayladı; pending: bekliyor; declined: reddetti; expired: süresinde yanıtlamadı; guest: hesapsız oyuncu';

-- Süresi dolan davetleri kapatır; kapanan davet sayısını döner. Kuralı uygular, başka bir şey yapmaz.
CREATE OR REPLACE FUNCTION public.expire_pending_invites()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_timeout INTERVAL;
  v_count INTEGER;
BEGIN
  SELECT make_interval(mins => invite_timeout_minutes) INTO v_timeout FROM rating_config WHERE id = 1;

  WITH stale AS (
    UPDATE game_players gp
    SET invite_status = 'expired'
    FROM games g
    WHERE g.id = gp.game_id
      AND gp.invite_status = 'pending'
      AND g.status IN ('pending', 'active')
      AND g.created_at < now() - v_timeout
    RETURNING gp.game_id
  ), cancelled AS (
    -- Süre dolduğu an bitiş zamanı olarak yazılır (kontrolün yapıldığı an değil)
    UPDATE games g
    SET status = 'cancelled', end_reason = 'expired', ended_at = g.created_at + v_timeout
    WHERE g.status = 'pending' AND g.id IN (SELECT game_id FROM stale)
    RETURNING g.id
  )
  SELECT count(*) INTO v_count FROM stale;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_invite(p_game_id UUID, p_accept BOOLEAN)
RETURNS TEXT  -- oyunun yeni durumu
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  g games%ROWTYPE;
  v_mine TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısın'; END IF;
  PERFORM expire_pending_invites();

  SELECT * INTO g FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oyun bulunamadı'; END IF;

  SELECT invite_status INTO v_mine FROM game_players WHERE game_id = p_game_id AND user_id = v_uid;
  IF v_mine = 'expired' THEN RAISE EXCEPTION 'Davetin süresi doldu'; END IF;
  IF g.is_ranked AND g.status <> 'pending' THEN
    RAISE EXCEPTION 'Bu oyun artık onay beklemiyor (durum: %)', g.status;
  END IF;

  UPDATE game_players
  SET invite_status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END, responded_at = now()
  WHERE game_id = p_game_id AND user_id = v_uid AND invite_status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Bu oyunda bekleyen davetin yok'; END IF;

  IF g.is_ranked THEN
    IF NOT p_accept THEN
      UPDATE games SET status = 'cancelled', ended_at = now(), ended_by = v_uid, end_reason = 'declined'
      WHERE id = p_game_id;
      RETURN 'cancelled';
    ELSIF NOT EXISTS (SELECT 1 FROM game_players WHERE game_id = p_game_id AND invite_status <> 'accepted') THEN
      UPDATE games SET status = 'active', started_at = now() WHERE id = p_game_id;
      RETURN 'active';
    END IF;
  END IF;
  RETURN g.status;
END;
$$;

-- Dönüş tipi değiştiği için (expires_at eklendi) yeniden oluşturulur
DROP FUNCTION public.my_invites();
CREATE FUNCTION public.my_invites()
RETURNS TABLE (game_id UUID, mode TEXT, is_ranked BOOLEAN, creator_name TEXT, players TEXT[],
               created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM expire_pending_invites();
  RETURN QUERY
  SELECT g.id, g.mode, g.is_ranked, cp.display_name || ' #' || lpad(cp.tag::TEXT, 4, '0'),
         (SELECT array_agg(x.name ORDER BY x.seat) FROM game_players x WHERE x.game_id = g.id),
         g.created_at,
         g.created_at + make_interval(mins => (SELECT invite_timeout_minutes FROM rating_config WHERE id = 1))
  FROM game_players me
  JOIN games g ON g.id = me.game_id
  LEFT JOIN profiles cp ON cp.id = g.created_by
  WHERE me.user_id = auth.uid()
    AND me.invite_status = 'pending'
    AND g.status IN ('pending', 'active')
  ORDER BY g.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_active_games()
RETURNS TABLE (game_id UUID, mode TEXT, is_ranked BOOLEAN, status TEXT, players TEXT[], round_count INTEGER, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM expire_pending_invites();
  RETURN QUERY
  SELECT g.id, g.mode, g.is_ranked, g.status,
         (SELECT array_agg(x.name ORDER BY x.seat) FROM game_players x WHERE x.game_id = g.id),
         g.round_count, g.created_at
  FROM games g
  WHERE g.status IN ('pending', 'active')
    AND g.created_at > now() - interval '2 days'
    AND (g.created_by = auth.uid()
         OR EXISTS (SELECT 1 FROM game_players me
                    WHERE me.game_id = g.id AND me.user_id = auth.uid() AND me.invite_status = 'accepted'))
  ORDER BY g.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_pending_invites(), public.my_invites() FROM PUBLIC, anon, authenticated;
-- Onay bekleme ekranı, oyunu okurken süresi dolanları kapatabilsin diye herkese açık (sadece kuralı uygular)
GRANT EXECUTE ON FUNCTION public.expire_pending_invites() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_invites() TO authenticated;

-- ── 6. Oyuncu arama ve sayfalı sıralama ─────────────────────────────────────
-- Oyuncu sayısı artınca tüm listeyi indirmek yerine sunucuda aranır (en fazla 5 öneri)
-- ve sıralama sayfa sayfa (10'ar) okunur. Eski list_players/get_leaderboard, yeni arayüz
-- yayına çıkana kadar eski sürüm kullandığı için duruyor.

-- Ada göre oyuncu arama: önce tam eşleşme, sonra başı uyanlar, sonra içinde geçenler.
-- "oğuzhan #18" yazılırsa etiketi 18 ile başlayanlar.
CREATE OR REPLACE FUNCTION public.search_players(p_query TEXT, p_limit INTEGER DEFAULT 5)
RETURNS TABLE (id UUID, display_name TEXT, tag SMALLINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH q AS (
    SELECT name_key(split_part(coalesce(p_query, ''), '#', 1)) AS k,
           nullif(regexp_replace(split_part(coalesce(p_query, ''), '#', 2), '[^0-9]', '', 'g'), '') AS t
  )
  SELECT p.id, p.display_name, p.tag
  FROM profiles p, q
  WHERE q.k <> ''
    AND p.display_name IS NOT NULL AND p.deleted_at IS NULL
    AND position(q.k IN name_key(p.display_name)) > 0
    AND (q.t IS NULL OR starts_with(lpad(p.tag::TEXT, 4, '0'), q.t))
  ORDER BY name_key(p.display_name) = q.k DESC,
           starts_with(name_key(p.display_name), q.k) DESC,
           p.display_name, p.tag
  LIMIT least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

-- Sayfalı sıralama; rank tüm listedeki sıra, total_count toplam oyuncu sayısı
CREATE OR REPLACE FUNCTION public.get_leaderboard_page(p_mode TEXT, p_limit INTEGER DEFAULT 10, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (rank BIGINT, user_id UUID, display_name TEXT, tag SMALLINT, rating NUMERIC, games_played INTEGER, total_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH ranked AS (
    SELECT row_number() OVER (ORDER BY r.rating DESC, r.games_played DESC, p.display_name) AS rank,
           r.user_id, p.display_name, p.tag, round(r.rating) AS rating, r.games_played,
           count(*) OVER () AS total_count
    FROM player_ratings r
    JOIN profiles p ON p.id = r.user_id
    WHERE r.mode = p_mode AND r.games_played > 0 AND p.deleted_at IS NULL
  )
  SELECT * FROM ranked
  ORDER BY rank
  LIMIT least(greatest(coalesce(p_limit, 10), 1), 50)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

-- Bir oyuncunun sıralamadaki yeri (sıralamada yoksa NULL)
CREATE OR REPLACE FUNCTION public.get_player_rank(p_mode TEXT, p_user_id UUID)
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT x.rank FROM (
    SELECT r.user_id,
           row_number() OVER (ORDER BY r.rating DESC, r.games_played DESC, p.display_name) AS rank
    FROM player_ratings r
    JOIN profiles p ON p.id = r.user_id
    WHERE r.mode = p_mode AND r.games_played > 0 AND p.deleted_at IS NULL
  ) x
  WHERE x.user_id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.search_players(TEXT, INTEGER),
  public.get_leaderboard_page(TEXT, INTEGER, INTEGER), public.get_player_rank(TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_players(TEXT, INTEGER) TO authenticated;   -- oyuncu eklemek giriş ister
GRANT EXECUTE ON FUNCTION public.get_leaderboard_page(TEXT, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_rank(TEXT, UUID) TO anon, authenticated;

-- Şu an süresi geçmiş halde bekleyen davetleri hemen kapat
SELECT expire_pending_invites();
