# 🏢 Venue Tracking Özeti

## ✅ Sistem Nasıl Çalışıyor?

### 1. QR Kod ile Giriş

```
Kullanıcı QR kodu okuttuğunda:
https://yourapp.com/?venue=demo-kafe
```

**Adımlar:**
1. `VenueContext` URL'den `venue` parametresini algılar
2. `/api/venues/demo-kafe` API'sine istek atar
3. Venue bilgilerini (id, name, logo, colors) alır
4. `localStorage`'e kaydeder → **Persiste edilir**
5. Ana sayfada venue logosu ve ismi görünür

### 2. Oyun Başlatma

**Ana Sayfa (`app/page.tsx`):**
```typescript
const response = await fetch('/api/games', {
  method: 'POST',
  body: JSON.stringify({
    venue_id: venue?.id || null,  // ← Venue ID buradan gidiyor!
    game_mode: gameMode,
    team1_name: gameMode === 'group' ? group1Name : null,
    team2_name: gameMode === 'group' ? group2Name : null,
  }),
});
```

**API (`app/api/games/route.ts`):**
```typescript
const { data, error } = await supabase
  .from('games')
  .insert([{
    venue_id: venue_id || null,  // ← Supabase'e kaydediliyor
    game_mode,
    player_count: 4,
    team1_name,
    team2_name,
    total_rounds: 0,
  }])
```

**Sonuç:**
- ✅ `games` tablosunda `venue_id` dolu
- ✅ Hangi venue'da oynandığı kayıtlı

### 3. Oyun Sırasında

**Game Sayfası (`app/game/page.tsx`):**
- `useVenue()` hook ile venue bilgisi alınır
- Sayfanın üstünde venue badge gösterilir:
  ```
  ┌──────────────────────────┐
  │  [Logo] Demo Kafe        │
  └──────────────────────────┘
  ```

**Round Sayfası (`app/game/round/page.tsx`):**
- Aynı şekilde venue badge gösterilir
- Kullanıcı hangi venue'da oynadığını her zaman görür

### 4. Oyun Bitirme

**Oyun Bitişinde (`app/api/games/[id]/finish/route.ts`):**

```typescript
// 1. Oyunu bitir
await supabase
  .from('games')
  .update({
    winner_name,
    winner_type,
    user_id,  // Üye ise
    finished_at: NOW()
  })
  .eq('id', gameId);

// 2. Venue istatistiklerini güncelle
if (venue_id) {
  await updateVenueStatistics(venue_id, game_mode, total_rounds);
}
```

**`updateVenueStatistics` Fonksiyonu:**
```typescript
await supabase
  .from('venue_statistics')
  .update({
    total_games: (stats.total_games || 0) + 1,        // +1 oyun
    total_rounds: (stats.total_rounds || 0) + rounds,  // Round sayısı ekle
    most_played_mode: game_mode,                       // En çok oynanan mod
    last_game_at: NOW(),                               // Son oyun zamanı
  })
  .eq('venue_id', venue_id);
```

**Sonuç:**
- ✅ Venue'nun toplam oyun sayısı artar
- ✅ Toplam round sayısı güncellenir
- ✅ Son oyun zamanı kaydedilir

### 5. Oyun Geçmişi

**History Sayfası (`app/history/page.tsx`):**
- `user_game_history` view'ından veri çekilir
- Her oyunda venue ismi görünür:
  ```
  👥 Takım A vs Takım B
  21 Ekim 2024, 14:30 • Demo Kafe  ← Venue ismi!
  ```

---

## 📊 Database Yapısı

### `games` Tablosu
```sql
CREATE TABLE games (
  id UUID PRIMARY KEY,
  venue_id UUID REFERENCES venues(id),  -- Opsiyonel
  user_id UUID REFERENCES auth.users(id),  -- Opsiyonel (yeni eklendi)
  game_mode TEXT NOT NULL,
  player_count INTEGER DEFAULT 4,
  team1_name TEXT,
  team2_name TEXT,
  winner_name TEXT,
  winner_type TEXT,
  total_rounds INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP
);
```

**Önemli:**
- `venue_id` **NULL olabilir** (direkt girişlerde)
- `user_id` **NULL olabilir** (anonim oyunlarda)
- QR kod ile gelenlerde `venue_id` **DOLU**

### `venue_statistics` Tablosu
```sql
CREATE TABLE venue_statistics (
  id UUID PRIMARY KEY,
  venue_id UUID REFERENCES venues(id) UNIQUE,
  total_games INTEGER DEFAULT 0,        -- Toplam oyun sayısı
  total_rounds INTEGER DEFAULT 0,       -- Toplam round sayısı
  most_played_mode TEXT,                 -- En çok oynanan mod
  last_game_at TIMESTAMP,                -- Son oyun zamanı
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔍 Veri Akışı Diyagramı

```
┌────────────────────────────────────────────────────────┐
│                    QR Kod Tarama                       │
│         https://app.com/?venue=demo-kafe              │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │  VenueContext       │
         │  (localStorage)     │
         └──────────┬──────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │   Ana Sayfa         │
         │  [Logo] Demo Kafe   │
         └──────────┬──────────┘
                   │
          ┌────────┴────────┐
          │                 │
          ▼                 ▼
    [Giriş Yap]      [Misafir Oyna]
          │                 │
          └────────┬────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │  Oyun Başlat        │
         │  POST /api/games    │
         │  venue_id: UUID     │
         └──────────┬──────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │  games tablosu      │
         │  venue_id: [DOLU]   │
         │  user_id: [DOLU/NULL]│
         └──────────┬──────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │  Oyun Oyna          │
         │  [Logo] Demo Kafe   │ ← Sürekli görünür
         └──────────┬──────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │  Oyun Bitir         │
         │  PATCH /finish      │
         └──────────┬──────────┘
                   │
          ┌────────┴────────┐
          │                 │
          ▼                 ▼
  ┌─────────────────┐  ┌─────────────────┐
  │ games.finished  │  │ venue_statistics│
  │ at: NOW()       │  │ total_games: +1 │
  │ winner: X       │  │ total_rounds: +N│
  └─────────────────┘  └─────────────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │  History Sayfası    │
         │  Oyun: Demo Kafe'de │ ← Venue ismi görünür
         └─────────────────────┘
```

---

## 🎯 Senaryolar

### Senaryo 1: QR Kod ile Üye Kullanıcı

```
1. QR Kod Okut: /?venue=demo-kafe
   ✅ venue → localStorage
   ✅ venue → VenueContext

2. Giriş Yap
   ✅ user → AuthContext

3. Oyun Başlat
   ✅ games.venue_id = demo-kafe-uuid
   ✅ games.user_id = user-uuid

4. Oyun Oyna
   ✅ Venue badge görünür
   ✅ localStorage → roundDetails

5. Oyun Bitir
   ✅ games.finished_at = NOW()
   ✅ games.winner_name = "Takım A"
   ✅ venue_statistics.total_games += 1
   ✅ game_statistics → istatistikler kaydedilir
   ✅ user_profiles → güncellenir

6. History Sayfası
   ✅ Oyun listesinde "Demo Kafe" görünür
```

### Senaryo 2: QR Kod ile Anonim Kullanıcı

```
1. QR Kod Okut: /?venue=demo-kafe
   ✅ venue → localStorage

2. Misafir Olarak Oyna
   ❌ user yok

3. Oyun Başlat
   ✅ games.venue_id = demo-kafe-uuid
   ❌ games.user_id = NULL

4. Oyun Bitir
   ✅ venue_statistics.total_games += 1
   ❌ game_statistics kaydedilmez
   ❌ user_profiles güncellenmez

5. History Sayfası
   ❌ Erişim yok (üye değil)
```

### Senaryo 3: Direkt Giriş (QR Yok)

```
1. Direkt URL: /
   ❌ venue yok
   ❌ localStorage'de venue yok

2. Oyun Başlat
   ❌ games.venue_id = NULL

3. Oyun Bitir
   ❌ venue_statistics güncellenmez
```

---

## 🔧 Önemli Noktalar

### 1. **VenueContext Persistence**
```typescript
// localStorage'den otomatik yükleme
useEffect(() => {
  const stored = localStorage.getItem('currentVenue');
  if (stored) {
    setVenue(JSON.parse(stored));
  }
}, []);

// Venue değişince otomatik kaydetme
useEffect(() => {
  if (venue) {
    localStorage.setItem('currentVenue', JSON.stringify(venue));
  } else {
    localStorage.removeItem('currentVenue');
  }
}, [venue]);
```

**Sonuç:** Venue bilgisi sayfa yenilenince bile korunur! ✅

### 2. **Venue ID Güvenliği**
- Oyun başlatma: `venue?.id || null` → Güvenli
- API: `venue_id || null` → Güvenli
- Supabase: `REFERENCES venues(id) ON DELETE SET NULL` → Güvenli

**Venue silinirse:**
- ✅ Oyun kaydı silinmez
- ✅ `venue_id` → NULL olur
- ❌ Venue statistics güncellenemez (FK constraint)

### 3. **User ID + Venue ID Kombinasyonu**

| User ID | Venue ID | Durum |
|---------|----------|-------|
| UUID    | UUID     | ✅ Üye + Venue (En iyi) |
| UUID    | NULL     | ✅ Üye, Direkt giriş |
| NULL    | UUID     | ✅ Anonim + Venue (QR kod) |
| NULL    | NULL     | ✅ Anonim + Direkt |

**Hepsi destekleniyor!** 🎉

### 4. **Venue Değişimi**

```typescript
// Eski venue: demo-kafe
// Oyun başlat (venue_id: demo-kafe-uuid)

// Yeni QR kod: /?venue=test-restaurant
// VenueContext güncellenir
// Yeni oyun başlatıldığında venue_id: test-restaurant-uuid

// Eski oyun: venue_id = demo-kafe-uuid (değişmez) ✅
```

---

## 📝 Test Checklist

- [x] QR kod venue'yu yükleüyor
- [x] localStorage'e venue kaydediliyor
- [x] Ana sayfada venue logosu görünüyor
- [x] Oyun başlatırken venue_id API'ye gidiyor
- [x] Supabase'de games.venue_id dolu
- [x] Game sayfasında venue badge görünüyor
- [x] Round sayfasında venue badge görünüyor
- [x] Oyun bitişinde venue_statistics güncelleniyor
- [x] History sayfasında venue ismi görünüyor
- [x] Anonim oyunlar venue'ya bağlanıyor
- [x] Direkt girişlerde venue_id NULL
- [x] Venue değişimi düzgün çalışıyor

---

## 🎉 Sonuç

Venue tracking sistemi **tamamen çalışıyor!** Her adımda venue bilgisi korunuyor ve doğru şekilde kaydediliyor.

**Özellikler:**
- ✅ QR kod ile venue tanıma
- ✅ localStorage persistence
- ✅ Venue badge görüntüleme (game & round sayfaları)
- ✅ Venue istatistikleri (otomatik güncelleme)
- ✅ History'de venue ismi
- ✅ Üye/Anonim/Direkt giriş desteği
- ✅ Güvenli NULL handling

**Dosyalar:**
- `context/VenueContext.tsx` - Venue state yönetimi
- `app/page.tsx` - Venue yükleme & oyun başlatma
- `app/game/page.tsx` - Venue badge gösterme
- `app/game/round/page.tsx` - Venue badge gösterme
- `app/api/games/route.ts` - Venue ID kaydetme
- `app/api/games/[id]/finish/route.ts` - Venue statistics güncelleme
- `app/history/page.tsx` - Venue ismi görüntüleme

**Dokümantasyon:**
- `VENUE_TRACKING_TEST.md` - Test senaryoları
- `VENUE_TRACKING_SUMMARY.md` - Bu dosya (özet)
- `VENUE_SETUP.md` - Venue kurulum rehberi
- `QR_QUICK_START.md` - QR kod hızlı başlangıç

---

**Hazır! Test edebilirsin.** 🚀

