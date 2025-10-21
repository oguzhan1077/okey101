# 🔍 Venue Tracking Test Senaryoları

## Test 1: QR Kod ile Oyun

### Adımlar:
1. **QR Kod Tarama**
   ```
   http://localhost:3000/?venue=demo-kafe
   ```
   
2. **Kontrol Et:**
   - ✅ Ana sayfada venue logosu görünüyor mu?
   - ✅ Venue ismi görünüyor mu?
   - ✅ Venue renkleri uygulanmış mı?
   
3. **Browser Console:**
   ```javascript
   localStorage.getItem('currentVenue')
   // Beklenen: {"id":"...", "name":"Demo Kafe", ...}
   ```

4. **Oyun Başlat:**
   - Oyun modunu seç
   - Oyuncuları gir
   - "Oyunu Başlat" tıkla

5. **Network Tab (Dev Tools):**
   ```
   POST /api/games
   Request Body:
   {
     "venue_id": "xxx-venue-uuid-xxx",  // ← Bu dolu olmalı!
     "game_mode": "group",
     "team1_name": "Takım A",
     "team2_name": "Takım B"
   }
   ```

6. **Supabase Database:**
   ```sql
   SELECT * FROM games ORDER BY created_at DESC LIMIT 1;
   -- venue_id kolonu dolu olmalı
   ```

7. **Oyun Oyna ve Bitir:**
   - Round ekle
   - Oyunu bitir

8. **Supabase Kontrol:**
   ```sql
   SELECT * FROM venue_statistics WHERE venue_id = 'demo-kafe-uuid';
   -- total_games: +1 artmış olmalı
   -- last_game_at: güncel olmalı
   ```

---

## Test 2: Direkt Giriş (QR yok)

### Adımlar:
1. **Direkt URL:**
   ```
   http://localhost:3000/
   ```

2. **Kontrol Et:**
   - ✅ Venue logosu YOK
   - ✅ Normal 101 Oyunu başlığı

3. **Oyun Başlat:**

4. **Network Tab:**
   ```
   POST /api/games
   Request Body:
   {
     "venue_id": null,  // ← NULL olmalı
     "game_mode": "single",
     "team1_name": null,
     "team2_name": null
   }
   ```

5. **Supabase Database:**
   ```sql
   SELECT * FROM games ORDER BY created_at DESC LIMIT 1;
   -- venue_id: NULL
   ```

---

## Test 3: Venue Değişimi (Edge Case)

### Adımlar:
1. **İlk Venue ile Giriş:**
   ```
   /?venue=demo-kafe
   ```

2. **Oyun Başlat (bitirme!)**

3. **Farklı Venue ile Yeniden Giriş:**
   ```
   /?venue=test-restaurant
   ```

4. **Kontrol Et:**
   - localStorage'daki venue değişti mi?
   - Yeni oyun başlatıldığında hangi venue kaydediliyor?

5. **Beklenen Davranış:**
   - ✅ Yeni venue localStorage'e kaydedilir
   - ✅ Yeni oyun yeni venue_id ile kaydedilir
   - ✅ Eski oyun eski venue'ya ait kalır

---

## Test 4: Üye vs Anonim (Venue ile)

### Üye Kullanıcı:
1. **QR Kod + Giriş Yap:**
   ```
   /?venue=demo-kafe → Giriş Yap
   ```

2. **Oyun Başlat ve Bitir**

3. **History Sayfası:**
   ```
   /history
   ```

4. **Kontrol Et:**
   - ✅ Oyun listesinde venue ismi görünüyor mu?
   - ✅ "Demo Kafe" yazıyor mu?

### Anonim Kullanıcı:
1. **QR Kod + Misafir Oyna:**
   ```
   /?venue=demo-kafe → Misafir Olarak Oyna
   ```

2. **Oyun Başlat ve Bitir**

3. **Supabase:**
   ```sql
   SELECT * FROM games WHERE venue_id IS NOT NULL AND user_id IS NULL;
   -- Anonim ama venue'lü oyunlar
   ```

---

## Test 5: Venue İstatistikleri

### Adımlar:
1. **Aynı venue'dan 5 oyun oyna:**
   ```
   /?venue=demo-kafe
   ```

2. **Supabase SQL:**
   ```sql
   SELECT 
     v.name,
     vs.total_games,
     vs.total_rounds,
     vs.most_played_mode,
     vs.last_game_at
   FROM venue_statistics vs
   JOIN venues v ON vs.venue_id = v.id
   WHERE v.slug = 'demo-kafe';
   ```

3. **Beklenen:**
   - total_games: 5
   - total_rounds: (oyunlardaki toplam round sayısı)
   - most_played_mode: 'group' veya 'single'
   - last_game_at: En son oyunun tarihi

---

## Hata Senaryoları

### Senaryo 1: Geçersiz Venue Slug
```
/?venue=olmayan-kafe
```

**Beklenen:**
- ✅ Venue yüklenemez
- ✅ Normal ana sayfa görünür (venue bilgisi olmadan)
- ✅ Oyun başlatılabilir (venue_id: null)

### Senaryo 2: Venue Silinmiş
1. QR kod ile giriş yap
2. Admin panelden venue'yu sil
3. Oyun bitir

**Beklenen:**
- ✅ Oyun kaydedilir (venue_id hala var)
- ⚠️ venue_statistics güncellenemeyebilir (FK constraint)

### Senaryo 3: localStorage Temizlendi
1. QR kod ile giriş
2. Oyun başlat
3. localStorage.clear()
4. Sayfayı yenile

**Beklenen:**
- ✅ Venue bilgisi kayboluyor
- ✅ Ama oyun devam ediyor (gameData localStorage'de)
- ✅ Oyun bitirme çalışıyor (gameId var)

---

## Debug Komutları

### Browser Console:
```javascript
// Venue kontrol
JSON.parse(localStorage.getItem('currentVenue'))

// Game ID kontrol
localStorage.getItem('currentGameId')

// Game Data kontrol  
JSON.parse(localStorage.getItem('101_game_data'))

// Tümünü temizle
localStorage.clear()
```

### Supabase SQL:
```sql
-- Son oyunlar
SELECT 
  g.id,
  g.venue_id,
  v.name as venue_name,
  g.user_id,
  g.game_mode,
  g.created_at
FROM games g
LEFT JOIN venues v ON g.venue_id = v.id
ORDER BY g.created_at DESC
LIMIT 10;

-- Venue istatistikleri
SELECT 
  v.name,
  vs.*
FROM venue_statistics vs
JOIN venues v ON vs.venue_id = v.id;

-- Kullanıcı oyunları
SELECT 
  g.id,
  v.name as venue_name,
  g.winner_name,
  g.created_at
FROM games g
LEFT JOIN venues v ON g.venue_id = v.id
WHERE g.user_id = 'USER_UUID_HERE'
ORDER BY g.created_at DESC;
```

---

## Sorun Tespit Checklist

- [ ] QR kod doğru venue'yu yüklüyor mu?
- [ ] localStorage'e venue kaydediliyor mu?
- [ ] Oyun başlatırken venue_id API'ye gidiyor mu?
- [ ] Supabase'de games.venue_id dolu mu?
- [ ] Oyun bitişinde venue_statistics güncelleniyor mu?
- [ ] History sayfasında venue ismi görünüyor mu?
- [ ] Farklı venue'lardan oyun ayırt ediliyor mu?
- [ ] Anonim oyunlar venue'ya bağlanıyor mu?
- [ ] Venue değişimi düzgün çalışıyor mu?

---

## Sonuç

Bu testleri çalıştırarak venue tracking sisteminin her adımını doğrulayabilirsiniz. Herhangi bir adımda sorun varsa, ilgili kod bölümünü kontrol edin.

**Önemli Dosyalar:**
- `app/page.tsx` - Venue yükleme ve oyun başlatma
- `context/VenueContext.tsx` - Venue state yönetimi
- `app/api/games/route.ts` - Oyun kaydı
- `app/api/games/[id]/finish/route.ts` - Oyun bitirme ve venue stats
- `app/history/page.tsx` - Venue ismi görüntüleme

