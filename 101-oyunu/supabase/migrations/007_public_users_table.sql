-- 1. public.users tablosu — auth.users'ın public mirror'ı
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Herkes okuyabilir (FK doğrulaması için anon key'in erişmesi gerekiyor)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public users are readable" ON public.users
FOR SELECT USING (true);

-- Kimse direkt ekleyemez/silemez — sadece trigger üzerinden
CREATE POLICY "No direct insert" ON public.users
FOR INSERT WITH CHECK (false);

CREATE POLICY "No direct delete" ON public.users
FOR DELETE USING (false);

-- 2. Mevcut auth kullanıcılarını public.users'a ekle
INSERT INTO public.users (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 3. Trigger: yeni kullanıcı kaydolduğunda otomatik ekle
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. games.user_id FK'yı auth.users'dan public.users'a taşı
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_user_id_fkey;
ALTER TABLE games
  ADD CONSTRAINT games_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- 5. game_statistics.user_id FK'yı auth.users'dan public.users'a taşı
ALTER TABLE game_statistics DROP CONSTRAINT IF EXISTS game_statistics_user_id_fkey;
ALTER TABLE game_statistics
  ADD CONSTRAINT game_statistics_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
