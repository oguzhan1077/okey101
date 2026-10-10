-- TEST: 3 test oyuncusu oluşturur (Test Ali, Test Ayşe, Test Can).
-- Giriş yapamazlar; uygulamada oyuncu listesinde görünürler, dereceli oyuna eklenebilirler.
-- Davetlerini test_2_bots_approve.sql ile onlar adına onaylarsın.
-- Tekrar çalıştırmak güvenlidir. Silmek için: test_9_reset.sql

INSERT INTO profiles (id, display_name, tag) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Test Ali', free_tag('Test Ali')),
  ('b0000000-0000-4000-8000-000000000002', 'Test Ayşe', free_tag('Test Ayşe')),
  ('b0000000-0000-4000-8000-000000000003', 'Test Can', free_tag('Test Can'))
ON CONFLICT (id) DO NOTHING;

SELECT id, display_name || ' #' || lpad(tag::TEXT, 4, '0') AS oyuncu FROM profiles ORDER BY created_at;
