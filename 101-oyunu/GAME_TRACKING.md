# 🎮 Oyun Takip Sistemi

## ✅ Tamamlandı!

Artık oynanan tüm oyunlar Supabase'e kaydediliyor!

## 📊 Nasıl Çalışıyor?

### 1️⃣ Oyun Başlatma
```
Ana Sayfa → Oyunu Başlat
   ↓
✅ Supabase'e oyun kaydı oluşturulur
✅ Game ID localStorage'e kaydedilir
✅ Oyun sayfasına yönlendirilir
```

**API:** `POST /api/games`

**Kaydedilen Bilgiler:**
- Venue ID (hangi işletmede oynandı)
- Oyun modu (group/single)
- Oyuncu isimleri
- Takım isimleri (grup modunda)

### 2️⃣ Round Ekleme
```
Round Sayfası → Round'u Kaydet
   ↓
✅ localStorage'e kaydedilir
✅ Supabase'e round detayları eklenir
✅ Toplam round sayısı güncellenir
```

**API:** `PATCH /api/games/{id}`

**Kaydedilen Bilgiler:**
- Round numarası
- Her oyuncunun puanı
- Cezalar (bireysel/takım)
- Okey durumu
- Bitirme durumu

### 3️⃣ Oyun Bitirme
```
Oyunu Bitir → Kazanan Belirlenir
   ↓
✅ Supabase'e oyun bitişi kaydedilir
✅ Kazanan kaydedilir
✅ venue_statistics tablosu güncellenir
```

**API:** `PATCH /api/games/{id}/finish`

**Kaydedilen Bilgiler:**
- Kazanan
- Bitiş zamanı
- Venue istatistikleri (otomatik)

## 🗄️ Veritabanı Yapısı

### `games` Tablosu
```sql
games
├── id                  (uuid) → Benzersiz oyun ID
├── venue_id            (uuid) → Hangi işletme
├── game_mode           (text) → 'group' veya 'single'
├── players             (jsonb) → Oyuncu isimleri
├── round_details       (jsonb) → Tüm round'ların detayları
├── winner              (text) → Kazanan
├── total_rounds        (int) → Toplam round sayısı
├── created_at          (timestamp) → Başlangıç
└── finished_at         (timestamp) → Bitiş
```

### `venue_statistics` Tablosu
```sql
venue_statistics
├── venue_id            (uuid)
├── total_games         (int) → Toplam oyun
├── total_rounds        (int) → Toplam round
├── most_played_mode    (text) → En popüler mod
└── last_game_at        (timestamp) → Son oyun
```

## 🔄 Hybrid Sistem

**localStorage + Supabase** birlikte çalışır:

✅ **Avantajları:**
- Offline çalışma (internet yoksa localStorage)
- Hızlı performans (localStorage cache)
- Kalıcı veri (Supabase backup)
- Hata toleransı (Supabase hatası olsa oyun devam eder)

## 📈 Kullanım Örnekleri

### Supabase'den Oyunları Görüntüleme

```sql
-- Tüm oyunları listele
SELECT * FROM games ORDER BY created_at DESC LIMIT 10;

-- Belirli bir venue'deki oyunlar
SELECT * FROM games WHERE venue_id = 'venue-uuid-here';

-- Bitmiş oyunlar
SELECT * FROM games WHERE finished_at IS NOT NULL;

-- En çok oynanan mod
SELECT game_mode, COUNT(*) as total 
FROM games 
GROUP BY game_mode 
ORDER BY total DESC;

-- Bugünkü oyunlar
SELECT * FROM games 
WHERE created_at >= CURRENT_DATE;
```

### Venue İstatistikleri

```sql
-- İşletme istatistikleri
SELECT 
  v.name,
  vs.total_games,
  vs.total_rounds,
  vs.most_played_mode,
  vs.last_game_at
FROM venues v
LEFT JOIN venue_statistics vs ON v.id = vs.venue_id
ORDER BY vs.total_games DESC;

-- En aktif işletmeler
SELECT 
  v.name,
  vs.total_games
FROM venue_statistics vs
JOIN venues v ON v.id = vs.venue_id
ORDER BY vs.total_games DESC
LIMIT 5;
```

## 🎯 Gelecek Özellikler

### Dashboard (İşletme Sahipleri İçin)
```
╔═══════════════════════════════════╗
║     MERKEZ KAFE DASHBOARD         ║
╠═══════════════════════════════════╣
║ 📊 Bugün:          12 oyun        ║
║ 📅 Bu Hafta:       87 oyun        ║
║ 📈 Bu Ay:          342 oyun       ║
║ 🏆 En Popüler:     Grup Modu      ║
║ ⏰ Ortalama Süre:  23 dakika      ║
║ 👥 Tekrar Oynayanlar: %67         ║
╚═══════════════════════════════════╝
```

### Liderlik Tablosu
```typescript
// En başarılı oyuncular (işletme bazında)
SELECT 
  players->>'player1' as player_name,
  COUNT(*) as total_wins
FROM games
WHERE winner = players->>'player1'
  AND venue_id = 'venue-uuid'
GROUP BY players->>'player1'
ORDER BY total_wins DESC
LIMIT 10;
```

### Oyun Geçmişi
```typescript
// Kullanıcının oynadığı oyunlar
const { data } = await supabase
  .from('games')
  .select('*')
  .or(`players->player1.eq.${playerName},players->player2.eq.${playerName}`)
  .order('created_at', { descending: true });
```

## 🔍 Debug & Test

### Test Etme

1. **Yeni Oyun Başlat**
   - Console'da: `localStorage.getItem('currentGameId')`
   - Game ID görünmeli

2. **Round Ekle**
   - Supabase Table Editor → games → ID ile ara
   - `round_details` array'ine bakın

3. **Oyunu Bitir**
   - `finished_at` timestamp'i eklenmeli
   - `winner` alanı dolu olmalı
   - `venue_statistics` güncellenmiş olmalı

### Console Logları

```javascript
// Oyun kayıt durumu
console.log('Game ID:', localStorage.getItem('currentGameId'));

// Round kayıt sonrası
console.log('Round saved to Supabase');

// Oyun bitiş sonrası
console.log('Game finished:', winner);
```

## ⚠️ Önemli Notlar

1. **Offline Çalışma:** İnternet olmasa bile oyun oynanabilir (localStorage)
2. **Hata Toleransı:** API hatası olsa bile oyun devam eder
3. **Manuel Senkronizasyon:** İleride offline oyunları senkronize etme özelliği eklenebilir
4. **localStorage Temizleme:** Yeni oyun başlatıldığında eski game ID temizlenir

## 🚀 Production Checklist

- [ ] RLS policy'lerini ekle
- [ ] API rate limiting ekle
- [ ] Venue bazlı veri izolasyonu
- [ ] Backup stratejisi oluştur
- [ ] Monitoring ekle
- [ ] Dashboard oluştur

---

**Durum:** ✅ Aktif ve Çalışıyor!

Artık her oyun otomatik olarak Supabase'e kaydediliyor ve venue istatistikleri güncelleniyor! 🎉

