-- ════════════════════════════════════════════════════════════════════════════
-- 008 — Sıfırdan başlangıç: analize uygun veri modeli, dereceli oyunlar, Elo
-- ════════════════════════════════════════════════════════════════════════════
--
-- İlke: HAM VERİ bir kez ve doğru yazılır (kim nerede oturdu, her elde kim ne aldı);
-- beceri puanı, okey değeri ve Elo gibi TÜRETİLMİŞ veri ham veriden hesaplanır ve
-- hangi model/formül sürümüyle hesaplandığıyla birlikte saklanır. Formül değişirse
-- tüm geçmiş ham veriden yeniden hesaplanabilir.
--
-- Ham veri:       profiles, games, game_players, rounds, round_scores, round_revisions
-- Türetilmiş:     okey_model, round_skill, game_results, player_ratings
-- Ayar:           rating_config
-- Analiz:         v_round_facts (her el × oyuncu, komşular ve türetilmiş alanlarla)
--
-- Tüm yazma işlemleri SECURITY DEFINER fonksiyonlarla yapılır; tablolarda yazma
-- politikası yoktur. Okuma herkese açıktır (isimler ve skorlar; e-posta yok).
--
-- Koltuklar (0–3) masadaki gerçek oturma düzenidir, OYUN YÖNÜNDE numaralı:
-- herkes sağındakine taş atar, solundakinden alır (saat yönünün tersi).
-- Koltuk+1 = sağdaki (taş atılan), koltuk−1 = soldaki (taş alınan).
-- Dağıtım da aynı yönde döner: sonraki dağıtan = (dağıtan + 1) % 4.
-- Grup modunda takımlar: koltuk 0+2 = takım 1, koltuk 1+3 = takım 2.

-- ── 0. Eski yapıyı arşivle ──────────────────────────────────────────────────
-- Eski tablolar archive şemasına taşınır: uygulama ve API görmez, analiz için durur.
-- Hesaplar silinince arşivin etkilenmemesi için hesaplara bağlı FK'lar kaldırılır.

CREATE SCHEMA IF NOT EXISTS archive;
REVOKE ALL ON SCHEMA archive FROM anon, authenticated;

DROP VIEW IF EXISTS public.user_game_history;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

ALTER TABLE IF EXISTS public.games DROP CONSTRAINT IF EXISTS games_user_id_fkey;
ALTER TABLE IF EXISTS public.games DROP CONSTRAINT IF EXISTS games_venue_id_fkey;
ALTER TABLE IF EXISTS public.game_statistics DROP CONSTRAINT IF EXISTS game_statistics_user_id_fkey;
ALTER TABLE IF EXISTS public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;
ALTER TABLE IF EXISTS public.users DROP CONSTRAINT IF EXISTS users_id_fkey;

ALTER TABLE IF EXISTS public.games SET SCHEMA archive;
ALTER TABLE IF EXISTS public.game_statistics SET SCHEMA archive;
ALTER TABLE IF EXISTS public.user_profiles SET SCHEMA archive;
ALTER TABLE IF EXISTS public.users SET SCHEMA archive;
ALTER TABLE IF EXISTS public.venue_statistics SET SCHEMA archive;
ALTER TABLE IF EXISTS public.venues SET SCHEMA archive;

-- ── 1. Ayarlar ──────────────────────────────────────────────────────────────

CREATE TABLE rating_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  formula_version TEXT NOT NULL DEFAULT 'v1',
  okey1_prior NUMERIC NOT NULL DEFAULT 83.5,      -- tek okeyin başlangıç değeri
  okey2_prior NUMERIC NOT NULL DEFAULT 167,       -- çift okeyin başlangıç değeri
  okey1_prior_weight NUMERIC NOT NULL DEFAULT 30,
  okey2_prior_weight NUMERIC NOT NULL DEFAULT 15,
  noise_single NUMERIC NOT NULL DEFAULT 156,      -- tekli: el başı iki oyuncu beceri farkının şans gürültüsü (SD)
  noise_group NUMERIC NOT NULL DEFAULT 290,       -- grup: el başı takım beceri farkının şans gürültüsü (SD)
  result_curve NUMERIC NOT NULL DEFAULT 2.5,      -- 1 SD fark ≈ 0.72, 2 SD ≈ 0.86, 3 SD ≈ 0.94 sonuç
  start_rating NUMERIC NOT NULL DEFAULT 1500,
  k_provisional NUMERIC NOT NULL DEFAULT 100,
  provisional_games INTEGER NOT NULL DEFAULT 10,
  k_base NUMERIC NOT NULL DEFAULT 64,
  k_mid NUMERIC NOT NULL DEFAULT 32,
  k_high NUMERIC NOT NULL DEFAULT 20,
  mid_threshold NUMERIC NOT NULL DEFAULT 2000,
  high_threshold NUMERIC NOT NULL DEFAULT 2400,
  max_rating_diff NUMERIC NOT NULL DEFAULT 400,   -- FIDE 400 kuralı
  min_rounds_ranked INTEGER NOT NULL DEFAULT 10,
  min_rounds_learning INTEGER NOT NULL DEFAULT 5, -- okey öğrenimine girecek en kısa oyun
  learn_from_unranked BOOLEAN NOT NULL DEFAULT true,
  rules JSONB NOT NULL DEFAULT '{
    "version": 1,
    "individual_penalty": 101,
    "team_penalty": 50.5,
    "finish_bonus": 101,
    "hand_finish_score": -202,
    "hand_finish_loser_points": 202,
    "hand_finish_loser_penalty": 202,
    "not_opened_points": 202
  }'::jsonb
);

INSERT INTO rating_config (id) VALUES (1);

COMMENT ON TABLE rating_config IS 'Elo/beceri ayarları ve geçerli oyun kuralları (tek satır). Kurallar her oyuna kopyalanır.';

-- ── 2. Ham veri ─────────────────────────────────────────────────────────────

-- Oyuncu kimliği. id = auth hesabı id'si; hesap silinse de profil (ve oyun geçmişi) kalır.
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX profiles_display_name_unique ON profiles (lower(display_name)) WHERE display_name IS NOT NULL;

COMMENT ON TABLE profiles IS 'Oyuncu kimliği; id = auth.users.id. Bilerek FK yok: hesap silinse de geçmiş korunur.';

CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('single', 'group')),
  is_ranked BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'finished', 'abandoned', 'cancelled')),
  created_by UUID REFERENCES profiles(id),
  team1_name TEXT,
  team2_name TEXT,
  first_dealer_seat SMALLINT CHECK (first_dealer_seat BETWEEN 0 AND 3),
  rules JSONB NOT NULL,                 -- oyun oynandığı andaki kurallar
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,               -- dereceli: 4 onay tamamlanınca; derecesiz: oluşturulunca
  ended_at TIMESTAMPTZ,
  ended_by UUID REFERENCES profiles(id),
  end_reason TEXT CHECK (end_reason IN ('completed', 'abandoned', 'declined', 'cancelled')),
  round_count INTEGER NOT NULL DEFAULT 0,
  winner_label TEXT,                    -- gösterim için: kazanan oyuncu veya takım adı
  -- Oyunu kuran cihazdan otomatik gelen bilgiler (analiz için; oyuncuya bir şey sorulmaz)
  setup_started_at TIMESTAMPTZ,         -- kurulum ekranının açıldığı an (cihaz saati)
  client_created_at TIMESTAMPTZ,        -- "Oyunu Başlat"a basıldığı an (cihaz saati)
  client_timezone TEXT,                 -- örn. Europe/Istanbul (yerel saat analizleri için)
  device_id TEXT,                       -- cihaza özgü rastgele kimlik (tarayıcıda saklanır)
  app_version TEXT,                     -- uygulamanın sürümü (commit)
  client_meta JSONB NOT NULL DEFAULT '{}',  -- diğer: tarayıcı, ekran boyutu, dil
  CONSTRAINT group_needs_teams CHECK (mode = 'single' OR (team1_name IS NOT NULL AND team2_name IS NOT NULL))
);

CREATE INDEX idx_games_status ON games (status, created_at DESC);
CREATE INDEX idx_games_ended ON games (ended_at DESC) WHERE status = 'finished';

CREATE TABLE game_players (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  seat SMALLINT NOT NULL CHECK (seat BETWEEN 0 AND 3),
  team SMALLINT CHECK (team IN (1, 2)),  -- grup modunda; tekli: NULL
  user_id UUID REFERENCES profiles(id),  -- misafir: NULL
  name TEXT NOT NULL,                    -- o anki görünen ad veya misafir adı
  invite_status TEXT NOT NULL CHECK (invite_status IN ('accepted', 'pending', 'declined', 'guest')),
  responded_at TIMESTAMPTZ,
  PRIMARY KEY (game_id, seat),
  UNIQUE (game_id, user_id)
);

CREATE INDEX idx_game_players_user ON game_players (user_id, invite_status) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN game_players.invite_status IS 'accepted: hesap oyunu onayladı; pending/declined: davet; guest: hesapsız oyuncu';

CREATE TABLE rounds (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_no INTEGER NOT NULL CHECK (round_no >= 1),
  dealer_seat SMALLINT CHECK (dealer_seat BETWEEN 0 AND 3),
  entered_by UUID REFERENCES profiles(id),
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),    -- sunucu zamanı (ilk kayıt)
  client_entered_at TIMESTAMPTZ,                    -- cihaz zamanı (internet gecikse de el süresi doğru çıksın)
  client_started_at TIMESTAMPTZ,                    -- el giriş ekranının açıldığı an (cihaz zamanı)
  device_id TEXT,                                   -- eli giren cihaz
  app_version TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, round_no)
);

-- Uygulamanın girdiği değerler aynen saklanır
CREATE TABLE round_scores (
  game_id UUID NOT NULL,
  round_no INTEGER NOT NULL,
  seat SMALLINT NOT NULL CHECK (seat BETWEEN 0 AND 3),
  points NUMERIC NOT NULL,              -- eldeki taş puanı (açamayan: 202, bitiren: 0, elden biten: −202)
  individual_penalty NUMERIC NOT NULL DEFAULT 0,
  team_penalty NUMERIC NOT NULL DEFAULT 0,
  okey1 BOOLEAN NOT NULL DEFAULT false,
  okey2 BOOLEAN NOT NULL DEFAULT false,
  finished BOOLEAN NOT NULL DEFAULT false,
  hand_finished BOOLEAN NOT NULL DEFAULT false,
  total NUMERIC NOT NULL,               -- elin skoru (kurallara göre doğrulanır)
  PRIMARY KEY (game_id, round_no, seat),
  FOREIGN KEY (game_id, round_no) REFERENCES rounds(game_id, round_no) ON DELETE CASCADE
);

-- Bir okey bir elde tek oyuncuda olabilir; eli tek kişi bitirir
CREATE UNIQUE INDEX round_scores_one_okey1 ON round_scores (game_id, round_no) WHERE okey1;
CREATE UNIQUE INDEX round_scores_one_okey2 ON round_scores (game_id, round_no) WHERE okey2;
CREATE UNIQUE INDEX round_scores_one_finisher ON round_scores (game_id, round_no) WHERE finished;

-- Düzeltme geçmişi: bir el değiştirilirse eski hali burada kalır
CREATE TABLE round_revisions (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_no INTEGER NOT NULL,
  revision INTEGER NOT NULL,            -- eski halin revizyon numarası
  dealer_seat SMALLINT,
  scores JSONB NOT NULL,                -- eski round_scores satırları
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_changed_at TIMESTAMPTZ,        -- düzeltmenin yapıldığı an (cihaz zamanı)
  device_id TEXT                        -- düzeltmeyi yapan cihaz
);

CREATE INDEX idx_round_revisions_game ON round_revisions (game_id, round_no);

-- ── 3. Türetilmiş veri ──────────────────────────────────────────────────────

-- Okey değeri modeli: her öğrenme bir yeni satır (sürüm). En son satır geçerlidir.
-- Regresyon: y = masa ort. − skor; x1 = tek okey, x2 = çift okey (el içinde ortalamadan sapma)
CREATE TABLE okey_model (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_game_id UUID REFERENCES games(id) ON DELETE SET NULL,  -- bu sürümü üreten oyun
  note TEXT,
  xtx11 NUMERIC NOT NULL,
  xtx12 NUMERIC NOT NULL,
  xtx22 NUMERIC NOT NULL,
  xty1 NUMERIC NOT NULL,
  xty2 NUMERIC NOT NULL,
  rounds_count INTEGER NOT NULL,
  okey1_value NUMERIC NOT NULL,         -- başlangıç değerine doğru çekilmiş tahmin
  okey2_value NUMERIC NOT NULL
);

-- Başlangıç: arşivdeki 20 oyunun 474 eli (2026-05-31 – 2026-10-06), prior ile birlikte
INSERT INTO okey_model (note, xtx11, xtx12, xtx22, xty1, xty2, rounds_count, okey1_value, okey2_value)
VALUES ('Arşiv: 20 oyun, 474 el (2026-05-31 – 2026-10-06)', 336.75, 0, 100.5, 25115.75, 12748.75, 474, 75.3, 132.1);

CREATE TABLE round_skill (
  game_id UUID NOT NULL,
  round_no INTEGER NOT NULL,
  seat SMALLINT NOT NULL,
  table_mean NUMERIC NOT NULL,          -- elin masa ortalaması
  raw_diff NUMERIC NOT NULL,            -- masa ort. − skor (pozitif = iyi)
  okey_luck NUMERIC NOT NULL,           -- okey şans payı (masa ortalamasına göre)
  skill NUMERIC NOT NULL,               -- raw_diff − okey_luck
  PRIMARY KEY (game_id, round_no, seat),
  FOREIGN KEY (game_id, round_no, seat) REFERENCES round_scores(game_id, round_no, seat) ON DELETE CASCADE
);

CREATE TABLE game_results (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  seat SMALLINT NOT NULL,
  user_id UUID REFERENCES profiles(id),
  final_score NUMERIC NOT NULL,
  place SMALLINT NOT NULL,              -- tekli: 1–4; grup: takımın sırası (1–2)
  raw_diff NUMERIC NOT NULL,
  okey_luck NUMERIC NOT NULL,
  skill_score NUMERIC NOT NULL,
  okey_count INTEGER NOT NULL,
  okey_model_id BIGINT NOT NULL REFERENCES okey_model(id),
  formula_version TEXT NOT NULL,
  rating_before NUMERIC,                -- sadece dereceli oyunlarda
  rating_after NUMERIC,
  k_factor NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, seat)
);

CREATE INDEX idx_game_results_user ON game_results (user_id, created_at DESC) WHERE user_id IS NOT NULL;

CREATE TABLE player_ratings (
  user_id UUID NOT NULL REFERENCES profiles(id),
  mode TEXT NOT NULL CHECK (mode IN ('single', 'group')),
  rating NUMERIC NOT NULL,
  games_played INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mode)
);

COMMENT ON TABLE player_ratings IS 'Güncel Elo (önbellek). Kaynak: game_results; oradan yeniden hesaplanabilir.';

-- ── 4. Güvenlik: okuma açık, yazma yok (sadece fonksiyonlar) ────────────────

ALTER TABLE rating_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE okey_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_skill ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read" ON rating_config FOR SELECT USING (true);
CREATE POLICY "read" ON profiles FOR SELECT USING (true);
CREATE POLICY "read" ON games FOR SELECT USING (true);
CREATE POLICY "read" ON game_players FOR SELECT USING (true);
CREATE POLICY "read" ON rounds FOR SELECT USING (true);
CREATE POLICY "read" ON round_scores FOR SELECT USING (true);
CREATE POLICY "read" ON round_revisions FOR SELECT USING (true);
CREATE POLICY "read" ON okey_model FOR SELECT USING (true);
CREATE POLICY "read" ON round_skill FOR SELECT USING (true);
CREATE POLICY "read" ON game_results FOR SELECT USING (true);
CREATE POLICY "read" ON player_ratings FOR SELECT USING (true);

GRANT SELECT ON rating_config, profiles, game_players, round_scores,
  okey_model, round_skill, game_results, player_ratings TO anon, authenticated;

-- Cihaz bilgileri (cihaz kimliği, tarayıcı) uygulamaya açık değil; sadece analizde (SQL editörü) görülür
REVOKE ALL ON games, rounds, round_revisions FROM anon, authenticated;
GRANT SELECT (id, mode, is_ranked, status, created_by, team1_name, team2_name, first_dealer_seat, rules,
  created_at, started_at, ended_at, ended_by, end_reason, round_count, winner_label) ON games TO anon, authenticated;
GRANT SELECT (game_id, round_no, dealer_seat, entered_by, entered_at, revision, updated_at) ON rounds TO anon, authenticated;
GRANT SELECT (id, game_id, round_no, revision, dealer_seat, scores, changed_by, changed_at) ON round_revisions TO anon, authenticated;

-- ── 5. Analiz görünümü ──────────────────────────────────────────────────────
-- Her el × oyuncu tek satır: kim, nerede oturdu, dağıtan kim, komşuları kim,
-- açtı mı, ceza adedi, el süreleri, o ana kadarki skor durumu, beceri.
-- Analizlerin ana girişi.

CREATE VIEW v_round_facts WITH (security_invoker = true) AS
SELECT
  g.id AS game_id,
  g.mode,
  g.is_ranked,
  g.status AS game_status,
  (g.rules ->> 'version')::INT AS rules_version,
  g.round_count AS game_round_count,
  r.round_no,
  r.entered_at,
  coalesce(r.client_entered_at, r.entered_at)
    AT TIME ZONE coalesce(g.client_timezone, 'Europe/Istanbul') AS local_entered_at,
  -- El süresi: bir önceki elin kaydından (ilk elde oyun başlangıcından) bu elin kaydına
  coalesce(r.client_entered_at, r.entered_at)
    - coalesce(lag(coalesce(r.client_entered_at, r.entered_at))
                 OVER (PARTITION BY r.game_id, rs.seat ORDER BY r.round_no),
               g.started_at) AS round_duration,
  -- Oyun süresi: önceki kayıttan giriş ekranının açılışına (taşlar oynanırken geçen süre)
  r.client_started_at
    - coalesce(lag(r.client_entered_at) OVER (PARTITION BY r.game_id, rs.seat ORDER BY r.round_no),
               g.started_at) AS play_duration,
  -- Giriş süresi: giriş ekranı açık kaldığı süre (sayım + yazma)
  r.client_entered_at - r.client_started_at AS entry_duration,
  r.revision,
  r.entered_by,
  r.device_id AS entry_device_id,
  r.dealer_seat,
  rs.seat,
  (rs.seat - r.dealer_seat + 4) % 4 AS seat_from_dealer,   -- 0 = dağıtan
  gp.team,
  gp.user_id,
  gp.name,
  gp.invite_status,
  prev_p.user_id AS takes_from_user_id,                    -- koltuk − 1: soldaki, taş aldığı kişi
  prev_p.name AS takes_from_name,
  next_p.user_id AS gives_to_user_id,                      -- koltuk + 1: sağdaki, taş attığı kişi
  next_p.name AS gives_to_name,
  rs.points,
  rs.individual_penalty,
  rs.team_penalty,
  rs.okey1,
  rs.okey2,
  rs.okey1::INT + rs.okey2::INT AS okey_count,
  rs.finished,
  rs.hand_finished,
  rh.round_hand_finished,
  CASE WHEN rh.round_hand_finished THEN NULL                -- elden bitende açıp açmadığı bilinmez
       ELSE rs.points <> (g.rules ->> 'not_opened_points')::NUMERIC END AS opened,
  CASE WHEN rh.round_hand_finished THEN 0
       ELSE round(rs.individual_penalty / (g.rules ->> 'individual_penalty')::NUMERIC, 2) END AS penalty_count,
  rs.total,
  -- Bu elden önceki toplam skor (geride/önde iken nasıl oynuyor)
  coalesce(sum(rs.total) OVER (PARTITION BY rs.game_id, rs.seat ORDER BY rs.round_no
                               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS score_before,
  sk.table_mean,
  sk.raw_diff,
  sk.okey_luck,
  sk.skill
FROM round_scores rs
JOIN rounds r ON r.game_id = rs.game_id AND r.round_no = rs.round_no
JOIN games g ON g.id = rs.game_id
JOIN game_players gp ON gp.game_id = rs.game_id AND gp.seat = rs.seat
JOIN game_players prev_p ON prev_p.game_id = rs.game_id AND prev_p.seat = (rs.seat + 3) % 4
JOIN game_players next_p ON next_p.game_id = rs.game_id AND next_p.seat = (rs.seat + 1) % 4
JOIN LATERAL (
  SELECT bool_or(x.hand_finished) AS round_hand_finished
  FROM round_scores x WHERE x.game_id = rs.game_id AND x.round_no = rs.round_no
) rh ON true
LEFT JOIN round_skill sk ON sk.game_id = rs.game_id AND sk.round_no = rs.round_no AND sk.seat = rs.seat;

-- Analiz görünümü uygulamaya açık değil (cihaz bilgisi içerir); SQL editöründen okunur
REVOKE ALL ON v_round_facts FROM anon, authenticated;

-- ── 6. Profil ve kayıt ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.valid_display_name(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_name IS NOT NULL
     AND length(trim(p_name)) BETWEEN 2 AND 20
     AND trim(p_name) ~ '^[a-zA-ZğĞıİşŞüÜöÖçÇ0-9., ]+$';
$$;

-- Kayıtta profil otomatik oluşur; ad signUp metadata'sından gelir.
-- Ad geçersiz/alınmışsa profil adsız açılır, kullanıcı ana sayfada belirler.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name TEXT := nullif(trim(regexp_replace(NEW.raw_user_meta_data ->> 'display_name', '\s+', ' ', 'g')), '');
BEGIN
  IF NOT valid_display_name(v_name) THEN v_name := NULL; END IF;
  BEGIN
    INSERT INTO profiles (id, display_name) VALUES (NEW.id, v_name) ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO profiles (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.is_display_name_available(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM profiles WHERE lower(display_name) = lower(trim(regexp_replace(p_name, '\s+', ' ', 'g')))
  );
$$;

-- Görünen adı belirle/değiştir. Dönüş: 'ok' | 'taken' | 'invalid'
CREATE OR REPLACE FUNCTION public.set_display_name(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_name TEXT := trim(regexp_replace(p_name, '\s+', ' ', 'g'));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısın'; END IF;
  IF NOT valid_display_name(v_name) THEN RETURN 'invalid'; END IF;
  INSERT INTO profiles (id, display_name) VALUES (v_uid, v_name)
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now();
  RETURN 'ok';
EXCEPTION WHEN unique_violation THEN
  RETURN 'taken';
END;
$$;

-- Oyun kurulumunda seçilebilecek kayıtlı oyuncular
CREATE OR REPLACE FUNCTION public.list_players()
RETURNS TABLE (id UUID, display_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.display_name FROM profiles p
  WHERE p.display_name IS NOT NULL AND p.deleted_at IS NULL
  ORDER BY p.display_name;
$$;

-- ── 7. Matematik yardımcıları ───────────────────────────────────────────────

-- Klasik Elo beklentisi; fark max_diff ile sınırlanır (FIDE 400 kuralı)
CREATE OR REPLACE FUNCTION public.elo_expected(p_ra NUMERIC, p_rb NUMERIC, p_max_diff NUMERIC)
RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE
AS $$
  SELECT 1.0 / (1.0 + power(10.0, -(greatest(-p_max_diff, least(p_max_diff, p_ra - p_rb)))::double precision / 400.0));
$$;

-- Beceri farkını 0–1 arası sonuca çevirir; fark şans gürültüsüne (SD) göre ölçeklenir
CREATE OR REPLACE FUNCTION public.elo_result(p_diff NUMERIC, p_noise NUMERIC, p_curve NUMERIC)
RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE
AS $$
  SELECT 1.0 / (1.0 + power(10.0, -(p_diff / p_noise / p_curve)::double precision));
$$;

-- Cihazdan gelen bilgiler (p_meta) güvenilmez: metin kısaltılır, bozuk zaman NULL olur.
-- Bu bilgiler kaydı asla düşürmemeli.
CREATE OR REPLACE FUNCTION public.meta_text(p_meta JSONB, p_key TEXT, p_max INT DEFAULT 100)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT left(nullif(trim(p_meta ->> p_key), ''), p_max);
$$;

CREATE OR REPLACE FUNCTION public.meta_time(p_meta JSONB, p_key TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN (p_meta ->> p_key)::TIMESTAMPTZ;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Bu kullanıcı bu oyuna el yazabilir/bitirebilir mi?
-- Dereceli: sadece onaylı oyuncular. Derecesiz: kuran kişi, onaylı oyuncular; misafirin kurduğu oyun: herkes (id'yi bilen).
CREATE OR REPLACE FUNCTION public.can_write_game(p_game games, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM game_players
                 WHERE game_id = p_game.id AND user_id = p_uid AND invite_status = 'accepted')
      OR (NOT p_game.is_ranked AND (p_game.created_by IS NULL OR p_game.created_by = p_uid));
$$;

-- ── 8. Oyun oluşturma ve davetler ───────────────────────────────────────────

-- p_players: koltuk sırasıyla (oyun yönünde, sağa doğru) 4 eleman: {"user_id": "..."} veya {"guest_name": "..."}
-- Dereceli: 4'ü de hesap olmalı, kuran kişi aralarında olmalı; diğerleri onaylayınca başlar.
-- Derecesiz: misafir olabilir; eklenen hesaplara davet gider ama oyun beklemez
--            (onaylayan hesabın oyunu, kendi istatistiğine sayılır).
-- p_meta: cihaz bilgileri {setup_started_at, client_created_at, timezone, device_id, app_version, ...}
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

  RETURN v_game_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_invite(p_game_id UUID, p_accept BOOLEAN)
RETURNS TEXT  -- oyunun yeni durumu
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  g games%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısın'; END IF;

  SELECT * INTO g FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oyun bulunamadı'; END IF;
  IF g.is_ranked AND g.status <> 'pending' THEN RETURN g.status; END IF;

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

-- Bana gelen bekleyen davetler (son 12 saat)
CREATE OR REPLACE FUNCTION public.my_invites()
RETURNS TABLE (game_id UUID, mode TEXT, is_ranked BOOLEAN, creator_name TEXT, players TEXT[], created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT g.id, g.mode, g.is_ranked, cp.display_name,
         (SELECT array_agg(x.name ORDER BY x.seat) FROM game_players x WHERE x.game_id = g.id),
         g.created_at
  FROM game_players me
  JOIN games g ON g.id = me.game_id
  LEFT JOIN profiles cp ON cp.id = g.created_by
  WHERE me.user_id = auth.uid()
    AND me.invite_status = 'pending'
    AND g.status IN ('pending', 'active')
    AND g.created_at > now() - interval '12 hours'
  ORDER BY g.created_at DESC;
$$;

-- Devam eden oyunlarım: oynadığım (onayladığım) veya kurduğum, bitmemiş oyunlar (son 2 gün)
CREATE OR REPLACE FUNCTION public.my_active_games()
RETURNS TABLE (game_id UUID, mode TEXT, is_ranked BOOLEAN, status TEXT, players TEXT[], round_count INTEGER, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
$$;

-- Oyunu sonlandırmadan kapat: onay beklerken iptal, oynanırken yarıda bırakma.
-- Yarıda kalan oyun Elo'ya sayılmaz; kim bıraktığı kaydedilir.
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
  IF NOT can_write_game(g, v_uid) THEN RAISE EXCEPTION 'Bu oyunu kapatamazsın'; END IF;

  IF g.status = 'pending' THEN
    UPDATE games SET status = 'cancelled', ended_at = now(), ended_by = v_uid, end_reason = 'cancelled'
    WHERE id = p_game_id;
    RETURN 'cancelled';
  ELSIF g.status = 'active' THEN
    UPDATE games SET status = 'abandoned', ended_at = now(), ended_by = v_uid, end_reason = 'abandoned'
    WHERE id = p_game_id;
    RETURN 'abandoned';
  END IF;
  RETURN g.status;
END;
$$;

-- ── 9. El kaydı ─────────────────────────────────────────────────────────────

-- p_scores: koltuk sırasıyla 4 eleman:
--   {points, individual_penalty, team_penalty, okey1, okey2, finished, hand_finished, total}
-- Yeni el: round_no = son el + 1. Var olan el: düzeltme (eski hali round_revisions'a yazılır).
-- Aynı içerik tekrar gönderilirse hiçbir şey değişmez (internet kesintisinde tekrar deneme güvenli).
-- p_client_time: kaydın cihazdaki zamanı; p_meta: {client_started_at, device_id, app_version}
-- p_base_revision: cihazın bildiği sürüm (0 = yeni el). Başka cihaz arada bu eli yazdıysa
--   kayıt reddedilir (ROUND_CONFLICT); böylece iki cihaz birbirinin elini sessizce ezemez.
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
  SELECT * INTO g FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oyun bulunamadı'; END IF;
  IF g.status <> 'active' THEN RAISE EXCEPTION 'Oyun aktif değil (durum: %)', g.status; END IF;
  IF NOT can_write_game(g, v_uid) THEN RAISE EXCEPTION 'Bu oyuna el yazamazsın'; END IF;
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

-- ── 10. Oyun sonu: beceri puanı, Elo, okey öğrenimi ─────────────────────────

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
                 - elo_expected(rt[i], rt[j], cfg.max_rating_diff);
        END LOOP;
        delta[i] := k[i] / 3 * s::NUMERIC;
      END LOOP;
    ELSE
      -- Takımlar tek maç; ortaklar aynı sonucu alır (kendi K'larıyla)
      team_a := elo_result((skill[1] + skill[3]) - (skill[2] + skill[4]), cfg.noise_group * sqrt(n::NUMERIC), cfg.result_curve);
      team_e := elo_expected((rt[1] + rt[3]) / 2, (rt[2] + rt[4]) / 2, cfg.max_rating_diff);
      delta[1] := k[1] * (team_a - team_e)::NUMERIC;
      delta[3] := k[3] * (team_a - team_e)::NUMERIC;
      delta[2] := k[2] * (team_e - team_a)::NUMERIC;
      delta[4] := k[4] * (team_e - team_a)::NUMERIC;
    END IF;

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

-- ── 11. Okuma fonksiyonları ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_leaderboard(p_mode TEXT)
RETURNS TABLE (user_id UUID, display_name TEXT, rating NUMERIC, games_played INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.user_id, p.display_name, round(r.rating), r.games_played
  FROM player_ratings r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.mode = p_mode AND r.games_played > 0 AND p.deleted_at IS NULL
  ORDER BY r.rating DESC;
$$;

-- ── 12. Yetkiler ────────────────────────────────────────────────────────────

-- Supabase yeni fonksiyonlara varsayılan olarak anon/authenticated yetkisi verir; önce hepsini kapat
REVOKE EXECUTE ON FUNCTION
  public.valid_display_name(TEXT),
  public.handle_new_user(),
  public.is_display_name_available(TEXT),
  public.set_display_name(TEXT),
  public.list_players(),
  public.elo_expected(NUMERIC, NUMERIC, NUMERIC),
  public.elo_result(NUMERIC, NUMERIC, NUMERIC),
  public.meta_text(JSONB, TEXT, INT),
  public.meta_time(JSONB, TEXT),
  public.my_active_games(),
  public.can_write_game(games, UUID),
  public.create_game(TEXT, BOOLEAN, JSONB, SMALLINT, TEXT, TEXT, JSONB),
  public.respond_invite(UUID, BOOLEAN),
  public.my_invites(),
  public.end_game_early(UUID),
  public.save_round(UUID, INTEGER, SMALLINT, JSONB, TIMESTAMPTZ, JSONB, INTEGER),
  public.finish_game(UUID),
  public.get_leaderboard(TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.valid_display_name(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.elo_expected(NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.elo_result(NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_display_name_available(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_game(TEXT, BOOLEAN, JSONB, SMALLINT, TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_round(UUID, INTEGER, SMALLINT, JSONB, TIMESTAMPTZ, JSONB, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_game(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_game_early(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_display_name(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_players() TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_invite(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_active_games() TO authenticated;
