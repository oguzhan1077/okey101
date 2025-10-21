# 🎮 Basit Oyun Takip Sistemi

## ✅ Basitleştirilmiş Versiyon

Supabase'e **sadece özet bilgiler** kaydediliyor. Detaylı round verileri localStorage'de kalıyor.

## 📊 Neyi Kaydediyoruz?

### ✅ Kaydedilenler (Supabase)
- 🏢 Venue ID (hangi işletmede)
- 🎯 Oyun modu (group/single)
- 👥 Oyuncu sayısı (4)
- 🏆 Takım isimleri (grup modunda)
- 🎊 Kazanan adı
- 📝 Kazanan tipi (team1/team2/single/tie)
- 🔢 Toplam round sayısı
- 📅 Başlangıç/bitiş zamanı

### ❌ Kaydedilmeyenler (localStorage'de)
- Oyuncu isimleri (detay)
- Round detayları (puanlar, cezalar)
- Okey durumları
- Bitirme durumları

## 🗄️ Basitleştirilmiş Tablo Yapısı

```sql
games
├── id                          (uuid)
├── venue_id                    (uuid)
├── game_mode                   ('group' | 'single')
├── player_count                (integer, default: 4)
├── team1_name                  (text, grup modunda)
├── team2_name                  (text, grup modunda)
├── winner_name                 (text)
├── winner_type                 (text)
├── total_rounds                (integer)
├── created_at                  (timestamp)
└── finished_at                 (timestamp)
```

## 🔄 Akış

### 1️⃣ Oyun Başlatma
```typescript
POST /api/games
{
  venue_id: "uuid",
  game_mode: "group",
  team1_name: "Galatasaray",
  team2_name: "Fenerbahçe"
}
```

**Sonuç:**
```sql
INSERT INTO games (
  venue_id, 
  game_mode, 
  team1_name, 
  team2_name,
  player_count
) VALUES (
  'uuid',
  'group',
  'Galatasaray',
  'Fenerbahçe',
  4
);
```

### 2️⃣ Round Ekleme
```typescript
PATCH /api/games/{id}
// Body yok - sadece sayıyı artır
```

**Sonuç:**
```sql
UPDATE games 
SET total_rounds = total_rounds + 1
WHERE id = 'uuid';
```

### 3️⃣ Oyun Bitirme
```typescript
PATCH /api/games/{id}/finish
{
  winner_name: "Galatasaray",
  winner_type: "team1"
}
```

**Sonuç:**
```sql
UPDATE games 
SET 
  winner_name = 'Galatasaray',
  winner_type = 'team1',
  finished_at = NOW()
WHERE id = 'uuid';

-- venue_statistics otomatik güncellenir
```

## 📈 İstatistikler

### Venue Dashboard Sorgular

```sql
-- Bugünkü oyunlar
SELECT COUNT(*) as today_games
FROM games
WHERE venue_id = 'uuid'
  AND created_at >= CURRENT_DATE;

-- Bu haftaki oyunlar
SELECT COUNT(*) as week_games
FROM games
WHERE venue_id = 'uuid'
  AND created_at >= date_trunc('week', CURRENT_DATE);

-- En popüler mod
SELECT game_mode, COUNT(*) as count
FROM games
WHERE venue_id = 'uuid'
GROUP BY game_mode
ORDER BY count DESC
LIMIT 1;

-- Ortalama oyun süresi (dakika)
SELECT AVG(EXTRACT(EPOCH FROM (finished_at - created_at)) / 60) as avg_duration_minutes
FROM games
WHERE venue_id = 'uuid'
  AND finished_at IS NOT NULL;

-- Ortalama round sayısı
SELECT AVG(total_rounds) as avg_rounds
FROM games
WHERE venue_id = 'uuid'
  AND finished_at IS NOT NULL;

-- En çok kazanan takım
SELECT winner_name, COUNT(*) as wins
FROM games
WHERE venue_id = 'uuid'
  AND winner_type IN ('team1', 'team2')
GROUP BY winner_name
ORDER BY wins DESC
LIMIT 5;
```

### Genel İstatistikler

```sql
-- En aktif işletmeler
SELECT 
  v.name,
  COUNT(g.id) as total_games,
  AVG(EXTRACT(EPOCH FROM (g.finished_at - g.created_at)) / 60) as avg_duration_minutes
FROM venues v
LEFT JOIN games g ON v.id = g.venue_id
WHERE g.finished_at IS NOT NULL
GROUP BY v.id, v.name
ORDER BY total_games DESC
LIMIT 10;

-- Grup vs Tekli oranı
SELECT 
  game_mode,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM games
WHERE finished_at IS NOT NULL
GROUP BY game_mode;
```

## 💡 Avantajlar

✅ **Basit:** Minimal veri, hızlı sorgular
✅ **Performanslı:** JSONB parsing yok
✅ **İstatistik:** Özet bilgiler yeterli
✅ **GDPR:** Oyuncu isimleri kaydedilmiyor
✅ **Offline:** localStorage backup

## 🎯 Kullanım Senaryoları

### Dashboard Kartı
```typescript
const stats = await supabase
  .from('games')
  .select('*')
  .eq('venue_id', venueId)
  .gte('created_at', today);

return {
  todayGames: stats.length,
  avgDuration: stats.reduce((sum, g) => {
    const duration = (new Date(g.finished_at) - new Date(g.created_at)) / 60000;
    return sum + duration;
  }, 0) / stats.length,
  mostPlayed: mostCommon(stats.map(g => g.game_mode)),
};
```

### Kazanan İstatistikleri
```typescript
const topWinners = await supabase
  .from('games')
  .select('winner_name, winner_type')
  .eq('venue_id', venueId)
  .not('winner_name', 'is', null)
  .limit(100);

const grouped = groupBy(topWinners, 'winner_name');
return Object.entries(grouped)
  .map(([name, games]) => ({ name, wins: games.length }))
  .sort((a, b) => b.wins - a.wins)
  .slice(0, 5);
```

## 🔄 Migration

Eğer eski detaylı sistem kullanıyorsanız:

```bash
# Supabase SQL Editor'de çalıştır
psql "connection-string"

# 1. Yeni migration'ı çalıştır
\i supabase/migrations/002_simplify_games.sql

# 2. Eski verileri temizle (opsiyonel)
TRUNCATE TABLE games;

# Veya eski verileri yedekle
CREATE TABLE games_old AS SELECT * FROM games;
```

## 📋 Kontrol Listesi

Supabase'de kontrol et:

- [ ] `games` tablosu basit yapıda mı?
- [ ] `players` ve `round_details` kolonları yok mu?
- [ ] `team1_name`, `team2_name` kolonları var mı?
- [ ] `winner_name`, `winner_type` kolonları var mı?
- [ ] `game_duration_minutes` kolonu var mı?

## 🎉 Sonuç

**Detaylı veri:** localStorage'de ✅
**Özet bilgi:** Supabase'de ✅
**İstatistikler:** Hızlı ve kolay ✅

---

**Not:** Round detaylarına ihtiyacınız olursa localStorage'den okuyabilirsiniz. Supabase'de sadece istatistikler için gerekli olan özet bilgiler tutuluyor.

