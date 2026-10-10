-- ════════════════════════════════════════════════════════════════════════════
-- 011 — Oyuncu istatistiklerinde genel ortalama ile kıyas
-- ════════════════════════════════════════════════════════════════════════════
--
-- get_player_stats artık 'baseline' da döner: oyuncunun oynadığı her modda (tekli/grup)
-- tüm bitmiş oyunların genel ortalaması. Arayüz her istatistiğin altında bunu gösterir.
-- Beceri tanım gereği masa ortalamasına göre olduğu için genel ortalaması 0'dır; ayrıca dönmez.

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
