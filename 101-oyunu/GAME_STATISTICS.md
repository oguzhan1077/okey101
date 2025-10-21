# 📊 Oyun İstatistikleri Sistemi

## Genel Bakış

Kullanıcılar artık geçmiş oyunlarını görüntüleyebilir ve detaylı istatistikleri inceleyebilirler. Bu özellik sadece **üye kullanıcılar** için geçerlidir.

## Özellikler

### ✅ Üye Kullanıcılar İçin

- ✅ Geçmiş oyunları listeleme
- ✅ Oyun başına detaylı istatistikler
- ✅ Oyuncu performans takibi
- ✅ Genel profil istatistikleri
- ✅ Kazanma oranı hesaplaması
- ✅ Favori oyun modu

### ❌ Anonim Kullanıcılar

- ❌ Geçmiş oyunları görüntüleyemez
- ❌ İstatistik takibi yok
- ✅ Oyun özeti Supabase'e kaydedilir (anonim olarak)

## Database Yapısı

### 1. `games` Tablosu (Güncellendi)

```sql
ALTER TABLE games 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
```

**Kolonlar:**
- `id` - Oyun UUID
- `user_id` - Kullanıcı UUID (opsiyonel - anonim için null)
- `venue_id` - Venue UUID (opsiyonel)
- `game_mode` - 'single' veya 'group'
- `player_count` - Oyuncu sayısı (genelde 4)
- `team1_name`, `team2_name` - Grup modu için takım isimleri
- `winner_name` - Kazanan ismi
- `winner_type` - 'team1', 'team2', 'single', 'tie'
- `total_rounds` - Toplam round sayısı
- `created_at`, `finished_at` - Başlangıç ve bitiş zamanları

### 2. `game_statistics` Tablosu (Yeni)

Oyun sonu detaylı istatistikleri saklar (sadece üye kullanıcılar için).

```sql
CREATE TABLE game_statistics (
  id UUID PRIMARY KEY,
  game_id UUID REFERENCES games(id),
  user_id UUID REFERENCES auth.users(id),
  
  -- Oyuncu bazlı istatistikler (JSON)
  players JSONB NOT NULL,
  
  -- Genel istatistikler
  total_okeys INTEGER,
  total_penalties INTEGER,
  total_finished_hands INTEGER,
  highest_round_score INTEGER,
  lowest_round_score INTEGER,
  
  -- Takım istatistikleri
  team1_total_score INTEGER,
  team2_total_score INTEGER,
  
  created_at TIMESTAMP
);
```

**Players JSONB Formatı:**
```json
[
  {
    "name": "Ali",
    "total_score": 85,
    "okey_count": 3,
    "penalty_count": 2,
    "finished_count": 5
  },
  ...
]
```

### 3. `user_profiles` Tablosu (Yeni)

Kullanıcı profil ve toplam istatistikleri (cache).

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  display_name TEXT,
  
  -- İstatistikler (cache)
  total_games_played INTEGER,
  total_games_won INTEGER,
  total_rounds_played INTEGER,
  favorite_mode TEXT,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 4. `user_game_history` View (Yeni)

Kullanıcı oyun geçmişi için kolay sorgu view'ı.

```sql
CREATE VIEW user_game_history AS
SELECT 
  g.id as game_id,
  g.user_id,
  g.venue_id,
  v.name as venue_name,
  g.game_mode,
  g.winner_name,
  g.total_rounds,
  g.created_at,
  g.finished_at,
  gs.players as player_stats,
  gs.total_okeys,
  gs.total_penalties,
  gs.total_finished_hands,
  gs.highest_round_score,
  gs.lowest_round_score
FROM games g
LEFT JOIN venues v ON g.venue_id = v.id
LEFT JOIN game_statistics gs ON g.id = gs.game_id
WHERE g.user_id IS NOT NULL AND g.finished_at IS NOT NULL;
```

## API Endpoints

### 1. `POST /api/games`

Yeni oyun başlatır.

**Request:**
```json
{
  "venue_id": "uuid-or-null",
  "game_mode": "single",
  "team1_name": null,
  "team2_name": null
}
```

### 2. `PATCH /api/games/[id]/finish`

Oyunu bitirir ve istatistikleri kaydeder.

**Request:**
```json
{
  "winner_name": "Ali & Veli",
  "winner_type": "team1",
  "user_id": "user-uuid",  // Opsiyonel
  "game_statistics": {     // Opsiyonel (sadece üye için)
    "players": [...],
    "total_okeys": 12,
    "total_penalties": 8,
    "total_finished_hands": 15,
    "highest_round_score": 45,
    "lowest_round_score": -20,
    "team1_total_score": 180,
    "team2_total_score": 220
  }
}
```

**İşlemler:**
1. Oyunu bitir (`finished_at` set et)
2. `user_id` varsa kaydet
3. Venue istatistiklerini güncelle
4. Oyun istatistiklerini kaydet (üye için)
5. Kullanıcı profilini güncelle (üye için)

### 3. `GET /api/user/games?user_id={uuid}`

Kullanıcının oyun geçmişini getirir.

**Response:**
```json
[
  {
    "game_id": "uuid",
    "game_mode": "group",
    "winner_name": "Takım A",
    "total_rounds": 15,
    "created_at": "2024-01-21T10:00:00Z",
    "finished_at": "2024-01-21T11:30:00Z",
    "venue_name": "Demo Kafe",
    "player_stats": [...],
    "total_okeys": 12,
    "total_penalties": 8,
    ...
  }
]
```

### 4. `GET /api/user/profile?user_id={uuid}`

Kullanıcı profil istatistiklerini getirir.

**Response:**
```json
{
  "id": "uuid",
  "total_games_played": 25,
  "total_games_won": 18,
  "total_rounds_played": 375,
  "favorite_mode": "group"
}
```

## Frontend Sayfaları

### 1. Ana Sayfa (`/`)

Üye kullanıcılar için "📊 Geçmiş" butonu eklendi.

```tsx
<Link href="/history">
  📊 Geçmiş
</Link>
```

### 2. Oyun Geçmişi Sayfası (`/history`)

**Özellikler:**
- Kullanıcı profil özeti (toplam oyun, kazanılan, round, kazanma oranı)
- Geçmiş oyunlar listesi
- Her oyun için kısa özet
- "Detay" butonu ile modal açma

**Görünüm:**
```
┌─────────────────────────────────────────┐
│  ← Geri    Oyun Geçmişi                 │
├─────────────────────────────────────────┤
│  📊 İstatistiklerim                     │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │
│  │ 25  │ │ 18  │ │ 375 │ │ 72% │      │
│  │Oyun │ │Kazan│ │Round│ │Oran │      │
│  └─────┘ └─────┘ └─────┘ └─────┘      │
├─────────────────────────────────────────┤
│  🎮 Geçmiş Oyunlarım                    │
│  ┌───────────────────────────────────┐  │
│  │ 👥 Takım A vs Takım B             │  │
│  │ 21 Ekim 2024, 14:30 • Demo Kafe   │  │
│  │ Kazanan: Takım A • 15 Round       │  │
│  │ Süre: 1s 30dk • Okey: 12          │  │
│  │                      [Detay →]    │  │
│  └───────────────────────────────────┘  │
│  ...                                     │
└─────────────────────────────────────────┘
```

### 3. Oyun Detay Modal

Bir oyuna tıklandığında açılan modal:

**İçerik:**
- **Genel Bilgiler:** Tarih, süre, toplam round, kazanan
- **Oyun İstatistikleri:** Toplam okey, ceza, bitirilen el, en yüksek/düşük puan
- **Oyuncu Performansları:** Her oyuncu için:
  - Toplam puan
  - Okey sayısı
  - Ceza sayısı
  - Bitirilen el sayısı

## İstatistik Hesaplama

### Oyun Sayfasında (`app/game/page.tsx`)

Oyun bittiğinde `calculateGameStatistics` fonksiyonu çalışır:

```typescript
const calculateGameStatistics = (rounds, game) => {
  // Her oyuncu için istatistikleri hesapla
  const playerStats = game.players.map((playerName, playerIndex) => {
    let totalScore = 0;
    let okeyCount = 0;
    let penaltyCount = 0;
    let finishedCount = 0;

    rounds.forEach(round => {
      const playerData = round.players[playerIndex];
      totalScore += playerData.total;
      if (playerData.hasOkey1) okeyCount++;
      if (playerData.hasOkey2) okeyCount++;
      if (playerData.finished || playerData.handFinished) finishedCount++;
      if (playerData.penalty > 0) penaltyCount++;
    });

    return { name, total_score, okey_count, penalty_count, finished_count };
  });

  // Genel istatistikler
  // ...

  return {
    players: playerStats,
    total_okeys,
    total_penalties,
    total_finished_hands,
    highest_round_score,
    lowest_round_score,
    team1_total_score,
    team2_total_score,
  };
};
```

### API'de İşleme (`app/api/games/[id]/finish/route.ts`)

1. **Oyun bitirme:** `winner_name`, `winner_type`, `finished_at` kaydet
2. **Venue istatistikleri:** `venue_statistics` tablosunu güncelle
3. **Oyun istatistikleri:** `game_statistics` tablosuna kaydet (sadece üye)
4. **Kullanıcı profili:** `user_profiles` tablosunu güncelle (sadece üye)

## Veri Akışı

### Üye Kullanıcı

```
[Oyun Başlat]
    ↓
[POST /api/games] → games tablosu (user_id: null)
    ↓
[Oyun Oyna] → localStorage (roundDetails)
    ↓
[Oyun Bitir]
    ↓
[calculateGameStatistics] → İstatistikleri hesapla
    ↓
[PATCH /api/games/[id]/finish]
  ├─ user_id kaydet
  ├─ game_statistics kaydet
  └─ user_profiles güncelle
    ↓
[/history sayfası] → İstatistikleri göster
```

### Anonim Kullanıcı

```
[Oyun Başlat]
    ↓
[POST /api/games] → games tablosu (user_id: null)
    ↓
[Oyun Oyna] → localStorage (roundDetails)
    ↓
[Oyun Bitir]
    ↓
[PATCH /api/games/[id]/finish]
  └─ Sadece özet kaydet (user_id: null)
    ↓
[İstatistik yok] → Geçmiş oyunlar görüntülenemez
```

## RLS Politikaları

### `games` Tablosu

```sql
-- Herkes okuyabilir
CREATE POLICY "Enable read access for all users" ON games
FOR SELECT USING (true);

-- Herkes ekleyebilir
CREATE POLICY "Enable insert for all users" ON games
FOR INSERT WITH CHECK (true);

-- Sadece kendi oyunlarını güncelleyebilir
CREATE POLICY "Enable update for own games or anonymous" ON games
FOR UPDATE USING (
  user_id IS NULL OR 
  user_id = auth.uid()
);
```

### `game_statistics` Tablosu

```sql
-- Kullanıcılar sadece kendi istatistiklerini görebilir
CREATE POLICY "Users can view own statistics" ON game_statistics
FOR SELECT USING (
  user_id IS NULL OR
  user_id = auth.uid()
);

-- Herkes ekleyebilir
CREATE POLICY "Enable insert for all users" ON game_statistics
FOR INSERT WITH CHECK (true);

-- Kimse güncelleyemez (immutable)
CREATE POLICY "No updates allowed" ON game_statistics
FOR UPDATE USING (false);
```

### `user_profiles` Tablosu

```sql
-- Kullanıcılar sadece kendi profillerini görebilir
CREATE POLICY "Users can view own profile" ON user_profiles
FOR SELECT USING (id = auth.uid());

-- Kullanıcılar kendi profillerini güncelleyebilir
CREATE POLICY "Users can update own profile" ON user_profiles
FOR UPDATE USING (id = auth.uid());

-- Kullanıcılar kendi profillerini oluşturabilir
CREATE POLICY "Users can insert own profile" ON user_profiles
FOR INSERT WITH CHECK (id = auth.uid());
```

## UI/UX Detayları

### Profil İstatistikleri Kartları

```tsx
<div className="grid grid-cols-4 gap-4">
  <div className="bg-gray-700/50 rounded-xl p-4 text-center">
    <div className="text-3xl font-bold text-blue-400">25</div>
    <div className="text-gray-300 text-sm">Toplam Oyun</div>
  </div>
  // ...
</div>
```

### Oyun Listesi

Her oyun kartı:
- Oyun modu ikonu (👥 grup, 🎯 tekli)
- Takım/oyuncu isimleri
- Tarih ve venue
- Kazanan (yeşil renk)
- Round sayısı
- Süre
- Okey sayısı
- "Detay →" butonu

### Detay Modalı

- Kapatma butonu (×)
- 3 bölüm:
  1. Genel Bilgiler (2x2 grid)
  2. Oyun İstatistikleri (2x3 grid)
  3. Oyuncu Performansları (liste)

## Performans Notları

1. **View kullanımı:** `user_game_history` view'ı karmaşık JOIN'leri basitleştirir
2. **Cache:** `user_profiles` tablosu toplam istatistikleri cache'ler
3. **Lazy loading:** Oyun detayları tıklanınca yüklenir
4. **Index'ler:** 
   - `idx_games_user_id`
   - `idx_game_stats_game_id`
   - `idx_game_stats_user_id`
   - `idx_user_profiles_id`

## Gelecek Geliştirmeler

- [ ] Filtre ve arama (tarih, mode, venue)
- [ ] Pagination (çok oyun olursa)
- [ ] Grafik ve chartlar (kazanma oranı trendi)
- [ ] Liderlik tablosu (venue bazlı)
- [ ] Oyuncu karşılaştırma
- [ ] Export (PDF, CSV)
- [ ] Sosyal paylaşım
- [ ] Başarım rozeti sistemi

## Test Senaryoları

### Senaryo 1: Üye Kullanıcı İlk Oyun

1. Üye olarak giriş yap
2. Oyun başlat ve bitir
3. `/history` sayfasına git
4. Profil istatistiklerini kontrol et (1 oyun)
5. Oyun detaylarına tıkla
6. İstatistikleri kontrol et

### Senaryo 2: Anonim Kullanıcı

1. Anonim olarak oyun başlat ve bitir
2. Giriş yap
3. `/history` sayfasına git
4. Anonim oyunun görünmediğini doğrula

### Senaryo 3: Çoklu Oyun

1. 5 farklı oyun oyna
2. `/history` sayfasında hepsini gör
3. Profil istatistiklerinin güncel olduğunu doğrula
4. Her oyunun detaylarını kontrol et

## Sorun Giderme

**Soru: İstatistikler görünmüyor**
- Supabase migrations çalıştırıldı mı?
- RLS politikaları aktif mi?
- API endpoint'leri çalışıyor mu?

**Soru: Anonim oyunlar üyeye bağlanabilir mi?**
- Şu anda hayır. Gelecekte "claim" özelliği eklenebilir.

**Soru: Oyun detayları (roundDetails) nerede saklanıyor?**
- Sadece localStorage'de (24 saat). Supabase'de sadece özet istatistikler var.

---

**Son Güncelleme:** 2024-01-21
**Versiyon:** 1.0

