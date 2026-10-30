-- 015: Canlı sinyal kanallarının yetkisi (Supabase Realtime Authorization)
-- Arayüz, değişiklik olunca diğer telefonlara veri taşımayan bir "yeniden yükle" sinyali yollar.
--   game:<oyun id>  herkese açık kanal (misafir cihaz da izler; oyun kimliğini sadece oyuncular bilir)
--   user:<hesap id> GİZLİ kanal: bu kurallar olmadan kimse dinleyemez ve gönderemez
-- Hesap kimlikleri sıralamada görünür; kanal açık olsaydı biri, kişinin ne zaman oyuna
-- eklendiğini anlık izleyebilirdi.
--   Dinleme: sadece hesabın sahibi.
--   Gönderme: sadece o hesabı, onay bekleyen ya da süren bir oyuna eklemiş olan kişi.
-- SIRA: önce bu SQL, sonra push. SQL çalışmadan push edilirse gizli kanal reddedilir,
-- ana sayfa davetleri yine 15 sn'lik düzenli kontrolle görür (bozulma olmaz).

-- Gönderen, alıcıyı kendi kurduğu açık bir oyuna eklemiş mi? (game_players RLS'ine takılmasın diye DEFINER)
CREATE OR REPLACE FUNCTION public.can_signal_user(p_topic TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM games g
    JOIN game_players gp ON gp.game_id = g.id
    WHERE g.created_by = auth.uid()
      AND g.status IN ('pending', 'active')
      AND gp.user_id::TEXT = split_part(p_topic, ':', 2)
  )
$$;

REVOKE ALL ON FUNCTION public.can_signal_user(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_signal_user(TEXT) TO authenticated;

DROP POLICY IF EXISTS "kendi kullanici kanalini dinler" ON realtime.messages;
CREATE POLICY "kendi kullanici kanalini dinler"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND realtime.topic() = 'user:' || auth.uid()::TEXT
);

DROP POLICY IF EXISTS "oyuna ekledigi kisiye sinyal gonderir" ON realtime.messages;
CREATE POLICY "oyuna ekledigi kisiye sinyal gonderir"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  realtime.messages.extension = 'broadcast'
  AND realtime.topic() LIKE 'user:%'
  AND public.can_signal_user(realtime.topic())
);
