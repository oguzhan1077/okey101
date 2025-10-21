# 💾 localStorage Yönetim Sistemi

## ⏱️ Saklama Süresi

Oyun verileri **varsayılan olarak 7 gün** saklanır.

```typescript
// lib/gameStorage.ts
const STORAGE_DURATION = {
  HOURS_24: 24 saat
  HOURS_48: 48 saat
  DAYS_7: 7 gün   ← VARSAYILAN
  DAYS_30: 30 gün
};
```

## 📦 Neler Saklanıyor?

### localStorage İçeriği:
```javascript
{
  roundDetails: [...],      // Tüm round detayları
  gameId: "uuid",           // Supabase game ID
  timestamp: 1729518000000, // Kayıt zamanı
  expiresAt: 1730122800000  // Son kullanma zamanı
}
```

### Saklanan Veriler:
- ✅ Round detayları (puanlar, cezalar, okey, vb.)
- ✅ Game ID (Supabase bağlantısı)
- ✅ Kayıt zamanı
- ✅ Son kullanma tarihi

## 🔄 Otomatik Temizleme

### Ne Zaman Temizlenir?

1. **Süre Dolduğunda (7 gün)**
   ```typescript
   // Ana sayfa açıldığında otomatik kontrol
   cleanupExpiredGames();
   ```

2. **Yeni Oyun Başlatıldığında**
   ```typescript
   clearGameData();
   ```

3. **Manuel Temizleme**
   - "Yeni Oyun" butonuna basıldığında
   - Kullanıcı onayı ile

## 📊 Kullanım

### Veri Kaydetme
```typescript
import { saveGameData } from '@/lib/gameStorage';

// Round eklendiğinde
saveGameData(roundDetails, gameId);
```

### Veri Yükleme
```typescript
import { loadGameData } from '@/lib/gameStorage';

// Oyun verilerini yükle (süre kontrolü ile)
const data = loadGameData();

if (data) {
  // Veri var ve geçerli
  console.log(data.roundDetails);
  console.log(data.gameId);
} else {
  // Veri yok veya süresi dolmuş
  console.log('Oyun verisi bulunamadı');
}
```

### Veri Temizleme
```typescript
import { clearGameData } from '@/lib/gameStorage';

// Tüm oyun verilerini temizle
clearGameData();
```

### Kalan Süre Kontrolü
```typescript
import { getRemainingTime } from '@/lib/gameStorage';

// Kalan dakika
const minutes = getRemainingTime();

if (minutes !== null) {
  console.log(`${minutes} dakika kaldı`);
  
  // Saat ve gün hesapla
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  console.log(`${days} gün ${hours % 24} saat`);
}
```

## 🎯 Özellikler

### ✅ Avantajlar

1. **Otomatik Temizleme**
   - Süresi dolan oyunlar otomatik silinir
   - localStorage şişmez

2. **Süre Kontrolü**
   - Her yüklemede kontrol edilir
   - Eski veriler gösterilmez

3. **Backward Compatible**
   - Eski `roundDetails` key'i ile uyumlu
   - Mevcut oyunlar çalışmaya devam eder

4. **Flexible**
   - İstenirse süre değiştirilebilir
   - Venue bazlı farklı süreler ayarlanabilir

### ⚙️ Süreyi Değiştirme

```typescript
// lib/gameStorage.ts içinde

// 24 saat için:
const DEFAULT_DURATION = STORAGE_DURATION.HOURS_24;

// 30 gün için:
const DEFAULT_DURATION = STORAGE_DURATION.DAYS_30;

// Özel süre (örn: 3 gün):
const DEFAULT_DURATION = 3 * 24 * 60 * 60 * 1000;
```

## 📱 Kullanıcı Bildirimi

### Kalan Süre Gösterimi (Opsiyonel)

```typescript
// Ana sayfada göster
const remaining = getRemainingTime();

{remaining && remaining < 1440 && ( // 1 gün = 1440 dakika
  <div className="text-yellow-400 text-sm">
    ⚠️ Oyun verileri {Math.floor(remaining / 60)} saat içinde silinecek
  </div>
)}
```

## 🔍 Debug

### Console'da Kontrol

```javascript
// Tüm oyun verisini gör
const stored = localStorage.getItem('gameData');
console.log(JSON.parse(stored));

// Kalan süre
import('@/lib/gameStorage').then(({ getRemainingTime }) => {
  console.log('Kalan dakika:', getRemainingTime());
});

// Temizle
import('@/lib/gameStorage').then(({ clearGameData }) => {
  clearGameData();
  console.log('Temizlendi');
});
```

### Test

```typescript
// Süresi dolmuş veri testi
const data = {
  roundDetails: [],
  gameId: 'test',
  timestamp: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 gün önce
  expiresAt: Date.now() - (24 * 60 * 60 * 1000),     // 1 gün önce
};

localStorage.setItem('gameData', JSON.stringify(data));

// Şimdi yükle - null dönmeli
const loaded = loadGameData();
console.log(loaded); // null
```

## 📋 Migration

### Eski Sistemden Geçiş

Eski sistemde sadece `roundDetails` key'i vardı:

```javascript
// ESKİ
localStorage.setItem('roundDetails', JSON.stringify(data));

// YENİ
saveGameData(data, gameId); // Timestamp otomatik eklenir
```

Mevcut kod **otomatik uyumlu**:
- Yeni format varsa onu kullanır
- Yoksa eski format'tan okur
- Yeni kayıtlarda yeni format kullanır

## 🎛️ Konfigürasyon

### Venue Bazlı Farklı Süreler (İleride)

```typescript
// Farklı venue'ler için farklı süreler
export function saveGameData(
  roundDetails: any[], 
  gameId: string | null,
  venueId?: string
) {
  let duration = DEFAULT_DURATION;
  
  // Premium venue'ler için daha uzun süre
  if (venueId && isPremiumVenue(venueId)) {
    duration = STORAGE_DURATION.DAYS_30;
  }
  
  // ... kaydet
}
```

## ⚠️ Önemli Notlar

1. **localStorage Limiti**
   - Tarayıcılar genelde 5-10MB limit koyar
   - Süre kontrolü ile bu aşılmaz

2. **Tarayıcı Değişimi**
   - localStorage tarayıcıya özeldir
   - Chrome'dan Firefox'a geçince veri kaybolur
   - Bu normal bir durumdur

3. **Incognito/Private Mode**
   - Incognito modda localStorage temizlenir
   - Sekme kapatıldığında veri kaybolur

4. **Manuel Temizleme**
   - Kullanıcı tarayıcı verilerini temizlerse kaybolur
   - Supabase'de backup olduğu için sorun olmaz (gelecekte)

## 🚀 Sonuç

**Varsayılan:** 7 gün otomatik temizleme ✅

İstenirse `lib/gameStorage.ts` dosyasından süre değiştirilebilir!

