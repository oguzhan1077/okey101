-- TEST: Test oyuncularına gelen bekleyen tüm davetleri onlar adına ONAYLAR.
-- Uygulamadan test oyuncularıyla dereceli oyun kurduktan sonra 5 DAKİKA İÇİNDE çalıştır
-- (davetlerin süresi 5 dakikada dolar, oyun iptal olur).
-- Uygulamadaki bekleme ekranı birkaç saniye içinde oyunu başlatır.

DO $$
DECLARE
  inv RECORD;
  v_status TEXT;
BEGIN
  FOR inv IN
    SELECT gp.game_id, gp.user_id, gp.name
    FROM game_players gp
    JOIN games g ON g.id = gp.game_id
    WHERE gp.user_id IN ('b0000000-0000-4000-8000-000000000001',
                         'b0000000-0000-4000-8000-000000000002',
                         'b0000000-0000-4000-8000-000000000003')
      AND gp.invite_status = 'pending'
      AND g.status IN ('pending', 'active')
    ORDER BY g.created_at, gp.seat
  LOOP
    -- Fonksiyonu test oyuncusu giriş yapmış gibi çalıştır
    PERFORM set_config('request.jwt.claims', json_build_object('sub', inv.user_id, 'role', 'authenticated')::text, true);
    v_status := respond_invite(inv.game_id, true);
    RAISE NOTICE '% onayladı → oyun durumu: %', inv.name, v_status;
  END LOOP;
END $$;

SELECT g.id, g.mode, g.status, string_agg(gp.name || ' (' || gp.invite_status || ')', ', ' ORDER BY gp.seat) AS oyuncular
FROM games g JOIN game_players gp ON gp.game_id = g.id
WHERE g.status IN ('pending', 'active')
GROUP BY g.id ORDER BY g.created_at DESC;
