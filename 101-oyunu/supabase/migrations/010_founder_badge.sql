-- ════════════════════════════════════════════════════════════════════════════
-- 010 — Kurucu rozeti ve ayrılmış #0000 etiketi
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. #0000 rastgele verilmez (etiketler 0001–9999); sadece elle verilir.
-- 2. profiles.badge: adın yanında gösterilen rozet ('founder' = kurucu üye).
--    Kullanıcılar kendilerine veremez (profiles'a yazma yetkisi yok); SQL editöründen verilir.
-- 3. Rozet; arama, sıralama ve oyuncu istatistiklerinde döner.
-- 4. Sistemin kurucusu Oğuzhan'a #0000 ve kurucu rozeti.

-- ── 1. #0000 ayrılmış ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.free_tag(p_name TEXT, p_except UUID DEFAULT NULL)
RETURNS SMALLINT
LANGUAGE plpgsql VOLATILE SET search_path = public
AS $$
DECLARE
  v_tag SMALLINT;
  i INT;
BEGIN
  FOR i IN 1..200 LOOP
    v_tag := (1 + floor(random() * 9999))::SMALLINT;   -- 0001–9999; #0000 ayrılmış
    IF NOT EXISTS (SELECT 1 FROM profiles
                   WHERE name_key(display_name) = name_key(p_name) AND tag = v_tag
                     AND (p_except IS NULL OR id <> p_except)) THEN
      RETURN v_tag;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Bu ad için boş etiket bulunamadı, başka bir ad deneyin';
END;
$$;

-- Ad değişince etiket korunur; ama #0000 sadece rozet sahibinde kalabilir
-- (set_display_name etiketi koruduğu için ek kural gerekmez: #0000'ı başka kimse alamaz)

-- ── 2. Rozet ────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN badge TEXT CHECK (badge IN ('founder'));
COMMENT ON COLUMN profiles.badge IS 'Adın yanındaki rozet: founder = kurucu üye. Sadece SQL editöründen verilir.';

-- ── 3. Rozet dönen fonksiyonlar (dönüş tipi değiştiği için yeniden oluşturulur) ──

DROP FUNCTION public.search_players(TEXT, INTEGER);
CREATE FUNCTION public.search_players(p_query TEXT, p_limit INTEGER DEFAULT 5)
RETURNS TABLE (id UUID, display_name TEXT, tag SMALLINT, badge TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH q AS (
    SELECT name_key(split_part(coalesce(p_query, ''), '#', 1)) AS k,
           nullif(regexp_replace(split_part(coalesce(p_query, ''), '#', 2), '[^0-9]', '', 'g'), '') AS t
  )
  SELECT p.id, p.display_name, p.tag, p.badge
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

DROP FUNCTION public.get_leaderboard_page(TEXT, INTEGER, INTEGER);
CREATE FUNCTION public.get_leaderboard_page(p_mode TEXT, p_limit INTEGER DEFAULT 10, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (rank BIGINT, user_id UUID, display_name TEXT, tag SMALLINT, badge TEXT,
               rating NUMERIC, games_played INTEGER, total_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH ranked AS (
    SELECT row_number() OVER (ORDER BY r.rating DESC, r.games_played DESC, p.display_name) AS rank,
           r.user_id, p.display_name, p.tag, p.badge, round(r.rating) AS rating, r.games_played,
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
    'badge', p.badge,
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

REVOKE EXECUTE ON FUNCTION public.search_players(TEXT, INTEGER), public.get_leaderboard_page(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_players(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_page(TEXT, INTEGER, INTEGER) TO anon, authenticated;

-- ── 4. Kurucu ───────────────────────────────────────────────────────────────

UPDATE profiles
SET tag = 0, badge = 'founder', updated_at = now()
WHERE id = '09423a57-5ba6-4e96-b648-b9b38e660d2f';   -- Oğuzhan (sistemin kurucusu)
