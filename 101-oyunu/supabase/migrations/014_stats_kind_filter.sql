-- 014: Profil istatistiklerinde dereceli / derecesiz filtresi
-- get_player_stats(p_user_id, p_kind): p_kind = 'ranked' | 'unranked' | 'all' (varsayılan, eski davranış).
-- Oyuncunun istatistikleri, genel ortalama ve son oyunlar seçilen türe göre süzülür.
-- Elo (rating, rated_games) her zaman dereceli oyunlardan gelir, filtreden etkilenmez.
-- SIRA: önce bu SQL, sonra push (yeni arayüz p_kind gönderir; eski arayüz bu SQL ile de çalışır).

-- Bilinmeyen değer 'all' sayılır
CREATE FUNCTION public.kind_matches(p_is_ranked BOOLEAN, p_kind TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$ SELECT p_kind IS DISTINCT FROM 'ranked' AND p_kind IS DISTINCT FROM 'unranked' OR p_is_ranked = (p_kind = 'ranked') $$;

-- İmza değiştiği için eskisi kaldırılır (aynı adla iki sürüm çağrıda belirsizlik yaratır)
DROP FUNCTION public.get_player_stats(UUID);

CREATE FUNCTION public.get_player_stats(p_user_id UUID, p_kind TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH my_games AS (
    SELECT g.id, g.mode, g.is_ranked, g.ended_at, g.round_count, gp.seat
    FROM game_players gp
    JOIN games g ON g.id = gp.game_id
    WHERE gp.user_id = p_user_id AND gp.invite_status = 'accepted' AND g.status = 'finished'
      AND kind_matches(g.is_ranked, p_kind)
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
  -- Genel ortalama: bu moddaki (ve seçilen türdeki) tüm bitmiş oyunların tüm oyuncuları (misafirler dahil)
  all_rounds AS (
    SELECT g.mode, rs.total, rs.points, rs.individual_penalty,
           rs.okey1::INT + rs.okey2::INT AS okeys, rs.finished,
           hf.game_id IS NOT NULL AS round_hand
    FROM round_scores rs
    JOIN games g ON g.id = rs.game_id
    LEFT JOIN round_scores hf ON hf.game_id = rs.game_id AND hf.round_no = rs.round_no AND hf.hand_finished
    WHERE g.status = 'finished' AND g.mode IN (SELECT DISTINCT mode FROM my_games)
      AND kind_matches(g.is_ranked, p_kind)
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
      AND kind_matches(g.is_ranked, p_kind)
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

REVOKE EXECUTE ON FUNCTION public.kind_matches(BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_player_stats(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_stats(UUID, TEXT) TO anon, authenticated;
