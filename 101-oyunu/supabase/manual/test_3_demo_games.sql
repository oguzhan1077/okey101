-- TEST: Senin hesabın + 3 test oyuncusuyla baştan sona oynanmış 2 dereceli oyun oluşturur
-- (tekli 12 el, grup 10 el). Her el farklı bir senaryo; sonunda oyunlar bitirilir, Elo işlenir.
-- Önce: uygulamadan kendi hesabını aç, test_1_bots.sql'i çalıştır.
-- Uygulamada görmek için: Ana sayfa → Sıralama, veya en alttaki sorgunun verdiği /game?id=... adresi.
-- Silmek için: test_9_reset.sql
--
-- Koltuklar oyun yönünde: 0 = sen, 1 = sağındaki (Ali), 2 = karşındaki (Ayşe), 3 = solundaki (Can).

-- Elin skorlarını kurallara göre hazırlar (toplam = puan + ceza − bitirene 101; elden bitirmede 101 düşülmez)
CREATE OR REPLACE FUNCTION pg_temp.el(
  p_points NUMERIC[], p_ind NUMERIC[], p_okey1 INT, p_okey2 INT, p_fin INT,
  p_hand BOOLEAN DEFAULT false, p_team NUMERIC[] DEFAULT '{0,0,0,0}'
) RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'points', p_points[i], 'individual_penalty', p_ind[i], 'team_penalty', p_team[i],
    'okey1', p_okey1 = i - 1, 'okey2', p_okey2 = i - 1,
    'finished', p_fin = i - 1, 'hand_finished', p_hand AND p_fin = i - 1,
    'total', p_points[i] + p_ind[i] + p_team[i] - CASE WHEN p_fin = i - 1 AND NOT p_hand THEN 101 ELSE 0 END
  ) ORDER BY i)
  FROM generate_series(1, 4) i;
$$;

-- Sonraki fonksiyon çağrılarını bu kullanıcı giriş yapmış gibi çalıştırır
CREATE OR REPLACE FUNCTION pg_temp.giris(p_user UUID) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Oyunu kurar, test oyuncularına onaylatır, elleri girer (sadece kuran yazabilir) ve bitirir
CREATE OR REPLACE FUNCTION pg_temp.oyna(p_mode TEXT, p_me UUID, p_rounds JSONB[], p_t0 TIMESTAMPTZ,
                             p_fix_round INT DEFAULT NULL, p_fix JSONB DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  bots UUID[] := ARRAY['b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
                       'b0000000-0000-4000-8000-000000000003']::UUID[];
  seats UUID[] := ARRAY[p_me] || bots;
  g UUID;
  i INT;
  t TIMESTAMPTZ;
BEGIN
  PERFORM pg_temp.giris(p_me);
  g := create_game(p_mode, true,
         jsonb_build_array(jsonb_build_object('user_id', seats[1]), jsonb_build_object('user_id', seats[2]),
                           jsonb_build_object('user_id', seats[3]), jsonb_build_object('user_id', seats[4])),
         0::SMALLINT,
         CASE WHEN p_mode = 'group' THEN 'Biz' END, CASE WHEN p_mode = 'group' THEN 'Onlar' END,
         jsonb_build_object('setup_started_at', p_t0 - interval '90 seconds', 'client_created_at', p_t0,
                            'timezone', 'Europe/Istanbul', 'device_id', 'demo', 'app_version', 'demo'));
  FOR i IN 1..3 LOOP
    PERFORM pg_temp.giris(bots[i]);
    PERFORM respond_invite(g, true);
  END LOOP;
  -- Gerçekçi zamanlar: davetler 1 dakikada onaylandı
  UPDATE games SET created_at = p_t0, started_at = p_t0 + interval '1 minute' WHERE id = g;
  UPDATE game_players SET responded_at = p_t0 + interval '40 seconds' WHERE game_id = g AND user_id <> p_me;

  FOR i IN 1..array_length(p_rounds, 1) LOOP
    t := p_t0 + interval '1 minute' + i * interval '8 minutes' + (i % 3) * interval '70 seconds';
    PERFORM pg_temp.giris(p_me);
    PERFORM save_round(g, i, ((i - 1) % 4)::SMALLINT, p_rounds[i], t,
                       jsonb_build_object('client_started_at', t - interval '35 seconds' - (i % 4) * interval '10 seconds',
                                          'device_id', 'demo-1', 'app_version', 'demo'),
                       0);
  END LOOP;

  -- Düzeltme örneği: bir el yanlış girilmiş, sonradan düzeltilmiş (eski hali round_revisions'ta)
  IF p_fix_round IS NOT NULL THEN
    PERFORM pg_temp.giris(p_me);
    PERFORM save_round(g, p_fix_round, ((p_fix_round - 1) % 4)::SMALLINT, p_fix,
                       t + interval '2 minutes', jsonb_build_object('device_id', 'demo-1'), 1);
  END IF;

  PERFORM pg_temp.giris(p_me);
  PERFORM finish_game(g);
  UPDATE games SET ended_at = t + interval '3 minutes' WHERE id = g;
  RETURN g;
END;
$$;

DO $$
DECLARE
  me UUID;
  t0 TIMESTAMPTZ := date_trunc('minute', now()) - interval '4 hours';
BEGIN
  SELECT id INTO me FROM profiles
  WHERE id NOT IN ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
                   'b0000000-0000-4000-8000-000000000003')
    AND display_name IS NOT NULL AND deleted_at IS NULL
  ORDER BY created_at LIMIT 1;
  IF me IS NULL THEN RAISE EXCEPTION 'Önce uygulamadan kendi hesabını oluştur (görünen adıyla)'; END IF;
  IF (SELECT count(*) FROM profiles WHERE id::TEXT LIKE 'b0000000-%') < 3 THEN
    RAISE EXCEPTION 'Önce test_1_bots.sql çalıştırılmalı';
  END IF;

  -- ── Tekli, 12 el ──  sıra: [sen, Ali, Ayşe, Can]
  PERFORM pg_temp.oyna('single', me, ARRAY[
    --          puanlar              bireysel ceza       okey1 okey2 bitiren
    pg_temp.el('{45,78,120,0}',     '{0,0,0,0}',         0,   -1,    3),        -- 1: Can bitirdi (−101), sende tek okey
    pg_temp.el('{33,0,202,56}',     '{101,0,0,0}',      -1,    2,    1),        -- 2: Ali bitirdi; Ayşe açamadı (202) ama çift okeyin biri ondaydı; sen 1 ceza yedin
    pg_temp.el('{0,98,61,202}',     '{0,0,0,0}',         0,    0,    0),        -- 3: İKİ OKEY de sende, bitirdin; Can açamadı (Ali'nin puanı yanlış girildi, sonra düzeltildi)
    pg_temp.el('{202,202,-202,202}','{202,202,0,202}',   2,   -1,    2, true),  -- 4: ELDEN: Ayşe elden bitirdi (−202), herkese 404
    pg_temp.el('{15,40,88,0}',      '{0,202,0,0}',       1,    3,    3),        -- 5: Can bitirdi; Ali 2 ceza yedi; okeyler Ali ve Can'da
    pg_temp.el('{202,0,30,44}',     '{0,0,0,0}',        -1,   -1,    1),        -- 6: Ali bitirdi; sen açamadın; kimseye okey işaretlenmedi
    pg_temp.el('{0,12,25,8}',       '{0,0,0,0}',         3,    3,    0),        -- 7: sen bitirdin ama iki okey de Can'daydı; herkes düşük puanla kaldı
    pg_temp.el('{52,70,0,202}',     '{101,0,0,0}',       2,   -1,    2),        -- 8: Ayşe bitirdi; Can açamadı; sen ceza
    pg_temp.el('{64,33,47,0}',      '{0,0,0,0}',         0,   -1,    3),        -- 9: Can bitirdi; okey sendeydi ama 64 puanla kaldın
    pg_temp.el('{22,0,19,81}',      '{0,0,101,0}',      -1,    1,    1),        -- 10: Ali bitirdi; Ayşe ceza
    pg_temp.el('{0,55,202,37}',     '{0,0,0,0}',         0,   -1,    0),        -- 11: sen bitirdin; Ayşe açamadı
    pg_temp.el('{28,41,0,63}',      '{0,0,0,0}',        -1,    2,    2)         -- 12: Ayşe bitirdi
  ], t0,
  3, pg_temp.el('{0,90,61,202}', '{0,0,0,0}', 0, 0, 0));                       -- 3. el düzeltmesi: Ali 98 değil 90

  -- ── Grup, 10 el ──  takımlar: Biz = sen + Ayşe (karşılıklı), Onlar = Ali + Can
  PERFORM pg_temp.oyna('group', me, ARRAY[
    --          puanlar              bireysel ceza       okey1 okey2 bitiren  elden  takım cezası
    pg_temp.el('{0,67,0,45}',       '{0,0,0,0}',         0,   -1,    0),                                  -- 1: sen bitirdin, ortağın Ayşe otomatik 0
    pg_temp.el('{88,0,202,0}',      '{0,0,0,0}',         1,    3,    1),                                  -- 2: Ali bitirdi; Ayşe açamadı
    pg_temp.el('{34,0,51,0}',       '{0,0,0,0}',        -1,   -1,    3, false, '{50.5,0,50.5,0}'),        -- 3: Can bitirdi; BİZE takım cezası (ikimize 50.5)
    pg_temp.el('{0,202,-202,202}',  '{0,202,0,202}',     2,    2,    2, true),                            -- 4: ELDEN: Ayşe iki okeyle elden bitirdi; sen 0, rakiplere 404
    pg_temp.el('{76,0,29,0}',       '{101,0,0,0}',      -1,   -1,    3),                                  -- 5: Can bitirdi; sen ceza
    pg_temp.el('{0,202,0,58}',      '{0,0,0,0}',        -1,    3,    2),                                  -- 6: Ayşe bitirdi; Ali açamadı
    pg_temp.el('{41,0,63,0}',       '{0,0,0,0}',        -1,   -1,    1, false, '{0,50.5,0,50.5}'),        -- 7: Ali bitirdi ama ONLARA takım cezası
    pg_temp.el('{0,90,0,202}',      '{0,0,0,0}',         0,    2,    0),                                  -- 8: sen bitirdin; Can açamadı; iki okey de bizde
    pg_temp.el('{120,0,85,0}',      '{0,0,0,0}',        -1,   -1,    3),                                  -- 9: Can bitirdi; biz yüksek kaldık
    pg_temp.el('{0,33,0,47}',       '{0,0,0,0}',         1,   -1,    2)                                   -- 10: Ayşe bitirdi
  ], t0 + interval '2 hours');
END $$;

-- Oluşan oyunlar: uygulamada açmak için adres sonuna /game?id=<id> ekle
SELECT g.id, g.mode, g.round_count AS el, g.winner_label AS kazanan,
       string_agg(gr.place || '. ' || gp.name || ' ' || gr.final_score || ' puan, beceri ' || round(gr.skill_score)
                  || ', Elo ' || round(gr.rating_before) || '→' || round(gr.rating_after), ' | ' ORDER BY gr.place, gr.seat) AS sonuc
FROM games g
JOIN game_results gr ON gr.game_id = g.id
JOIN game_players gp ON gp.game_id = g.id AND gp.seat = gr.seat
WHERE g.device_id = 'demo'
GROUP BY g.id
ORDER BY g.created_at;
