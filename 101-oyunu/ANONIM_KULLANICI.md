# 🎮 Anonim Kullanıcı Sistemi

## Genel Bakış

Uygulama artık **anonim (misafir) kullanıcıları** destekliyor! QR kod ile gelen veya doğrudan uygulamayı açan kullanıcılar, üyelik olmadan oyun oynayabilirler.

## Özellikler

### ✅ Desteklenen Özellikler (Anonim Kullanıcılar)
- ✅ Oyun başlatma (Single ve Group modları)
- ✅ Skor takibi
- ✅ Round ekleme ve düzenleme
- ✅ Oyun bitirme
- ✅ LocalStorage üzerinden geçici kayıt (24 saat)
- ✅ Venue branding (QR kod ile gelen kullanıcılar için)

### ❌ Desteklenmeyen Özellikler (Anonim Kullanıcılar)
- ❌ Oyun geçmişi kaydetme (Supabase'e tam kayıt)
- ❌ İstatistik takibi
- ❌ Profil yönetimi
- ❌ Çoklu cihaz senkronizasyonu

### 🔐 Üyelik Avantajları
- ✅ Tüm oyunların kalıcı kaydı
- ✅ İstatistik ve geçmiş takibi
- ✅ Çoklu cihaz desteği
- ✅ Venue'ya özel liderlik tabloları (gelecekte)

## Kullanıcı Deneyimi

### Ana Sayfa (Giriş Yapmamış)

```
┌─────────────────────────────────┐
│                                 │
│   [Venue Logo]                  │
│   Venue İsmi                    │
│   Hoş geldiniz mesajı           │
│                                 │
├─────────────────────────────────┤
│                                 │
│   101 Oyunu                     │
│   Dijital skor takip uygulaması │
│                                 │
├─────────────────────────────────┤
│                                 │
│  📌 Devam eden oyununuz var     │
│  [🎮 Oyuna Devam Et]            │
│                                 │
├─────────────────────────────────┤
│                                 │
│  [🎯 Misafir Olarak Oyna]       │ ← YENİ!
│                                 │
│  ─────────── veya ──────────    │
│                                 │
│  [🔐 Giriş Yap]                 │
│  [📝 Kayıt Ol]                  │
│                                 │
├─────────────────────────────────┤
│                                 │
│  💡 Hesap oluşturarak oyun      │
│  geçmişinizi kaydedebilirsiniz  │
│                                 │
└─────────────────────────────────┘
```

### Oyun Akışı

#### Anonim Kullanıcı
```
1. Ana Sayfa
   ↓
2. "Misafir Olarak Oyna" tıkla
   ↓
3. Oyun modu seç (Single/Group)
   ↓
4. Oyuncu isimlerini gir
   ↓
5. Oyun başlat
   ↓
6. Oyun oyna (LocalStorage'de kayıt)
   ↓
7. Oyunu bitir
   ↓
8. Özet bilgi Supabase'e kaydedilir
   (venue_id, game_mode, winner, vs.)
```

#### Üye Kullanıcı
```
1. Ana Sayfa
   ↓
2. Giriş Yap / Kayıt Ol
   ↓
3. Oyun başlat
   ↓
4. Oyun oyna (LocalStorage + Supabase)
   ↓
5. Oyunu bitir
   ↓
6. Tam kayıt Supabase'e + profilde göster
```

## Teknik Detaylar

### Database Yapısı

#### `games` Tablosu
```sql
CREATE TABLE games (
  id UUID PRIMARY KEY,
  venue_id UUID REFERENCES venues(id),  -- Opsiyonel
  game_mode TEXT NOT NULL,               -- 'group' veya 'single'
  player_count INTEGER DEFAULT 4,
  team1_name TEXT,                       -- Grup modu için
  team2_name TEXT,                       -- Grup modu için
  winner_name TEXT,
  winner_type TEXT,                      -- 'team1', 'team2', 'single', 'tie'
  total_rounds INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP
);
```

**Not:** `user_id` yok! Oyunlar user'a bağlı değil, sadece venue'ya bağlı (opsiyonel).

### LocalStorage Yönetimi

Oyun detayları her iki durumda da LocalStorage'de saklanır:
- **Anonim kullanıcılar:** 24 saat süre ile (gameStorage.ts)
- **Üye kullanıcılar:** 24 saat süre ile + Supabase yedek

```typescript
// lib/gameStorage.ts
interface StoredGameData {
  roundDetails: RoundDetail[];
  gameId: string | null;
  timestamp: number; // Süre dolumu kontrolü
}

const EXPIRATION_TIME_MS = 24 * 60 * 60 * 1000; // 24 saat
```

### API Endpoints

#### POST `/api/games`
Yeni oyun başlatır (hem anonim hem üye).

**Request:**
```json
{
  "venue_id": "uuid-veya-null",
  "game_mode": "single",
  "team1_name": null,
  "team2_name": null
}
```

**Response:**
```json
{
  "id": "game-uuid",
  "venue_id": "venue-uuid",
  "game_mode": "single",
  "player_count": 4,
  "total_rounds": 0,
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### PATCH `/api/games/[id]/finish`
Oyunu bitirir.

**Request:**
```json
{
  "winner_name": "Ali & Veli",
  "winner_type": "team1"
}
```

**Response:**
```json
{
  "id": "game-uuid",
  "winner_name": "Ali & Veli",
  "winner_type": "team1",
  "finished_at": "2024-01-01T01:30:00Z"
}
```

## QR Kod Entegrasyonu

QR kod ile gelen kullanıcılar:
1. Venue bilgilerini görür (logo, isim, mesaj)
2. Venue'nun renklerini görür (branding)
3. "Misafir Olarak Oyna" ile direkt oyun başlatabilir
4. Oyun sonucu venue istatistiklerine eklenir

**QR Kod URL Formatı:**
```
https://yourapp.com/?venue=demo-kafe
```

## Güvenlik

### Row Level Security (RLS)

Games tablosu için RLS politikaları:

```sql
-- Herkes okuyabilir (anonim dahil)
CREATE POLICY "Enable read access for all users" ON games
FOR SELECT USING (true);

-- Herkes ekleyebilir (anonim dahil)
CREATE POLICY "Enable insert for all users" ON games
FOR INSERT WITH CHECK (true);

-- Herkes güncelleyebilir (anonim dahil)
CREATE POLICY "Enable update for all users" ON games
FOR UPDATE USING (true);
```

**Not:** Bu politikalar test aşamasındadır. Production'da daha kısıtlayıcı olabilir.

## Veri Akışı

### Anonim Kullanıcı
```
[Ana Sayfa]
    ↓ (Misafir Oyna)
[Oyun Modu Seçimi]
    ↓
[Oyuncu İsimleri]
    ↓
[API: POST /games] → Supabase (özet)
    ↓
[Oyun Sayfası]
    ↓ (her round)
[localStorage: round detayları]
[API: PATCH /games/[id]] → total_rounds++
    ↓ (oyun bitti)
[API: PATCH /games/[id]/finish] → winner kaydı
    ↓
[Venue Statistics Güncelleme]
```

### Üye Kullanıcı
Aynı akış + ek olarak:
- User profile'a oyun bağlantısı (gelecekte)
- Kişisel istatistikler (gelecekte)

## Geliştirme Notları

### Yapılan Değişiklikler

1. **app/page.tsx**
   - "Misafir Olarak Oyna" butonu eklendi
   - Giriş yapmamış kullanıcılar için yeni UI
   - Devam eden oyun kontrolü (anonim için de)

2. **app/api/games/route.ts**
   - `user_id` gereksinimi kaldırıldı
   - Sadece `venue_id` opsiyonel olarak kabul edilir

3. **supabase/migrations/**
   - `games` tablosu basitleştirildi
   - `user_id` kolonu yok
   - `venue_id` opsiyonel

4. **lib/gameStorage.ts**
   - 24 saatlik süre kontrolü
   - Otomatik temizleme mekanizması

### Gelecek Geliştirmeler

- [ ] Anonim oyunları üyeliğe dönüştürme (claim)
- [ ] Venue bazlı liderlik tabloları
- [ ] Kişisel istatistikler (üye kullanıcılar için)
- [ ] Sosyal paylaşım özellikleri
- [ ] Oyun geçmişi detay sayfası

## Test Senaryoları

### Senaryo 1: Anonim Oyun (QR Kod ile)
1. QR kod okut: `/?venue=demo-kafe`
2. Venue logosu ve ismini gör
3. "Misafir Olarak Oyna" tıkla
4. Single mod seç, isimleri gir
5. Oyunu oyna ve bitir
6. Supabase'de `games` tablosuna kayıt eklendiğini doğrula
7. `venue_statistics` güncellendiğini doğrula

### Senaryo 2: Anonim Oyun (Direkt)
1. Uygulamayı aç (QR yok)
2. "Misafir Olarak Oyna" tıkla
3. Oyunu oyna ve bitir
4. `venue_id` null olarak kaydedildiğini doğrula

### Senaryo 3: Üye Oyun
1. Giriş yap
2. Normal oyun akışı
3. Oyun geçmişinin görüneceğini doğrula (gelecekte)

### Senaryo 4: localStorage Süre Dolumu
1. Anonim oyun başlat
2. 24+ saat bekle (veya timestamp'i manuel değiştir)
3. Uygulamayı aç
4. Oyunun temizlendiğini doğrula

## Sık Sorulan Sorular

**S: Anonim kullanıcılar oyun geçmişini görebilir mi?**
A: Hayır, sadece aktif oyunlarını LocalStorage'de görebilirler (24 saat).

**S: Anonim oyunlar Supabase'e kaydedilir mi?**
A: Evet, ama sadece özet bilgiler (mod, winner, venue). Detaylı round bilgileri kaydedilmez.

**S: Anonim kullanıcı sonradan üye olursa ne olur?**
A: Şu anda eski oyunlar bağlanmaz. Gelecekte "claim" özelliği eklenebilir.

**S: Venue olmadan anonim oyun oynanabilir mi?**
A: Evet! Direkt uygulamayı açıp "Misafir Olarak Oyna" diyebilirler.

**S: RLS politikaları güvenli mi?**
A: Test aşamasında geniş tutuldu. Production'da kısıtlanabilir.

---

**Son Güncelleme:** 2024-01-21
**Versiyon:** 1.0

