-- Tüm hesapları siler (herkes yeniden kayıt olacak).
-- SADECE 008_fresh_start.sql çalıştırıldıktan SONRA çalıştırın: 008 eski tabloları
-- archive şemasına taşıyıp hesaplara bağlı FK'ları kaldırır, böylece arşiv silinmez.
-- Geri alınamaz.

DO $$
BEGIN
  IF to_regclass('archive.games') IS NULL THEN
    RAISE EXCEPTION 'Önce 008_fresh_start.sql çalıştırılmalı (arşiv bulunamadı)';
  END IF;
END $$;

DELETE FROM auth.users;
