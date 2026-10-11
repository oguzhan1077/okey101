-- 013: Rozet, adın geçtiği her yerde
-- Oyun ekranı (get_game), davet kartı (my_invites) ve devam eden oyunlar listesi (my_active_games)
-- artık oyuncuların rozetini de döndürür. Sadece okuma tarafı değişir; veri değişmez.
-- Eski arayüz yeni alanları yok sayar, yeni arayüz alan yoksa rozetsiz gösterir: sıra önemli değil.

-- ── 1. Oyun ekranı: her koltukta hesabın rozeti ─────────────────────────────

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
        'seat', gp.seat, 'team', gp.team, 'user_id', gp.user_id, 'name', gp.name,
        'invite_status', gp.invite_status, 'badge', p.badge) ORDER BY gp.seat)
      FROM game_players gp LEFT JOIN profiles p ON p.id = gp.user_id
      WHERE gp.game_id = g.id), '[]'::jsonb),
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

-- ── 2. Davet kartı: kuranın ve masadakilerin rozeti ─────────────────────────
-- player_badges, players ile aynı sırada (koltuk sırası); rozetsiz koltukta NULL.

DROP FUNCTION public.my_invites();
CREATE FUNCTION public.my_invites()
RETURNS TABLE (game_id UUID, mode TEXT, is_ranked BOOLEAN, creator_name TEXT, creator_badge TEXT,
               players TEXT[], player_badges TEXT[], created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM expire_pending_invites();
  RETURN QUERY
  SELECT g.id, g.mode, g.is_ranked, cp.display_name || ' #' || lpad(cp.tag::TEXT, 4, '0'), cp.badge,
         (SELECT array_agg(x.name ORDER BY x.seat) FROM game_players x WHERE x.game_id = g.id),
         (SELECT array_agg(xp.badge ORDER BY x.seat)
          FROM game_players x LEFT JOIN profiles xp ON xp.id = x.user_id WHERE x.game_id = g.id),
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

-- ── 3. Devam eden oyunlar: masadakilerin rozeti ─────────────────────────────

DROP FUNCTION public.my_active_games();
CREATE FUNCTION public.my_active_games()
RETURNS TABLE (game_id UUID, mode TEXT, is_ranked BOOLEAN, status TEXT, players TEXT[], player_badges TEXT[],
               round_count INTEGER, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM expire_pending_invites();
  RETURN QUERY
  SELECT g.id, g.mode, g.is_ranked, g.status,
         (SELECT array_agg(x.name ORDER BY x.seat) FROM game_players x WHERE x.game_id = g.id),
         (SELECT array_agg(xp.badge ORDER BY x.seat)
          FROM game_players x LEFT JOIN profiles xp ON xp.id = x.user_id WHERE x.game_id = g.id),
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

-- ── İzinler ─────────────────────────────────────────────────────────────────
-- get_game CREATE OR REPLACE ile yetkilerini korur; yeniden oluşturulan ikisi baştan verilir.

REVOKE EXECUTE ON FUNCTION public.my_invites(), public.my_active_games() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_invites(), public.my_active_games() TO authenticated;
