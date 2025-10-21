# İşletmeye Özel QR Kod Sistemi - Kurulum Rehberi

## 🎯 Genel Bakış

Bu sistem, 101 Oyunu uygulamasını QR kod taraması ile işletmeye özel branding ile açmanıza olanak tanır.

## 📦 Kurulum Adımları

### 1. NPM Paketlerini Yükleyin

```bash
cd 101-oyunu
npm install qrcode
npm install @types/qrcode --save-dev
```

### 2. Supabase Veritabanını Ayarlayın

`supabase/migrations/001_create_venues.sql` dosyasındaki SQL komutlarını Supabase SQL Editor'de çalıştırın:

1. Supabase Dashboard'a gidin
2. SQL Editor'ü açın
3. Migration dosyasının içeriğini kopyalayıp çalıştırın
4. Tabloların oluştuğunu kontrol edin

### 3. Ortam Değişkenlerini Kontrol Edin

`.env.local` dosyanızda şunların olduğundan emin olun:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## 🏢 İşletme Ekleme

### Admin Paneli Üzerinden

1. Uygulamayı başlatın: `npm run dev`
2. Tarayıcıda şu adrese gidin: `http://localhost:3000/admin/venues`
3. "Yeni İşletme Ekle" butonuna tıklayın
4. Formu doldurun:
   - **İşletme Adı**: Kafe/Restaurant adı (örn: "Merkez Kafe")
   - **Slug**: URL'de kullanılacak isim (otomatik oluşur: "merkez-kafe")
   - **Logo URL**: İşletme logosu (opsiyonel)
   - **Ana Renk**: Gradient'in başlangıç rengi
   - **İkincil Renk**: Gradient'in bitiş rengi
   - **Hoş Geldin Mesajı**: Müşterilere gösterilecek mesaj

### API Üzerinden (Alternatif)

```javascript
const response = await fetch('/api/venues', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Merkez Kafe',
    slug: 'merkez-kafe',
    logo_url: 'https://example.com/logo.png',
    primary_color: '#10B981',
    secondary_color: '#3B82F6',
    welcome_message: 'Merkez Kafe\'ye hoş geldiniz!'
  })
});
```

## 📱 QR Kod Oluşturma

### Yöntem 1: Admin Paneli (Önerilen)

1. `http://localhost:3000/admin/venues` adresine gidin
2. İşletme kartında "QR Kod Oluştur" butonuna tıklayın
3. QR kodu görüntüleyin ve "QR Kodu İndir" ile PNG olarak kaydedin
4. QR kodu yazdırıp masalara yerleştirin

### Yöntem 2: Manuel URL

Her işletmenin QR URL formatı:
```
https://yourdomain.com?venue=slug-adi
```

Bu URL'i herhangi bir QR kod oluşturucu ile kodlayabilirsiniz.

## 🎨 Nasıl Çalışır?

### 1. QR Kod Tarama
Müşteri masadaki QR kodu telefonuyla tarar.

### 2. Özel Branding Yükleme
- Uygulama venue bilgilerini API'den çeker
- Logo, renk teması ve hoş geldin mesajını gösterir
- Venue bilgisi localStorage'e kaydedilir

### 3. Kişiselleştirilmiş Deneyim
- Arka plan renkleri işletmeye özel gradient olur
- Logo ana sayfada görünür
- Hoş geldin mesajı gösterilir

## 🔧 Teknik Detaylar

### Oluşturulan Dosyalar

```
101-oyunu/
├── supabase/migrations/
│   └── 001_create_venues.sql          # Veritabanı şeması
├── context/
│   └── VenueContext.tsx                # Venue state yönetimi
├── app/
│   ├── api/venues/
│   │   ├── route.ts                    # Tüm venues, POST endpoint
│   │   └── [slug]/route.ts             # Tek venue GET endpoint
│   ├── admin/venues/
│   │   └── page.tsx                    # Admin paneli
│   ├── layout.tsx                      # VenueProvider eklendi
│   └── page.tsx                        # QR kod desteği eklendi
└── VENUE_SETUP.md                      # Bu dosya
```

### Veritabanı Şeması

**venues** tablosu:
- `id`: UUID (Primary Key)
- `name`: İşletme adı
- `slug`: URL slug (unique)
- `logo_url`: Logo URL'i
- `primary_color`: Ana renk
- `secondary_color`: İkincil renk
- `welcome_message`: Hoş geldin mesajı
- `is_active`: Aktif mi?
- `created_at`: Oluşturulma tarihi

**games** tablosu:
- İleride oyun istatistikleri için kullanılabilir
- Venue ID ile ilişkilendirilmiş

### API Endpoints

- `GET /api/venues` - Tüm aktif işletmeleri listele
- `POST /api/venues` - Yeni işletme oluştur
- `GET /api/venues/[slug]` - Slug'a göre işletme getir

## 📊 İstatistikler (Gelecek Özellik)

Şu anki yapı, gelecekte şu özellikleri destekleyecek şekilde hazırlandı:

- Hangi işletmede kaç oyun oynandı
- İşletme bazlı liderlik tablosu
- En popüler oyun modu
- Günlük/haftalık aktif kullanıcılar

## 🚀 Deployment

### Vercel/Netlify

1. Environment variables'ları ekleyin:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

2. Supabase migration'ları çalıştırın

3. Deploy edin

4. QR kodları production URL ile yeniden oluşturun

### QR Kod Yazdırma İpuçları

- **Boyut**: En az 5x5 cm (kolay tarama için)
- **Malzeme**: Lamine veya plastik (dayanıklılık için)
- **Yerleştirme**: Masa üzerinde görünür bir yere
- **İçerik**: İşletme adını ve "Oyun başlatmak için tara" yazısını ekleyin

## 🎯 Kullanım Senaryosu

1. **Kafe Sahibi**: Admin panelden kafeyi ekler, QR kodu indirir
2. **Baskı**: QR kodu yazdırır, her masaya koyar
3. **Müşteri**: Masadaki QR kodu tarar
4. **Uygulama**: Kafe logolu ve renkli tema ile açılır
5. **Oyun**: Müşteriler 101 oyununu oynar
6. **İstatistik**: Kafe sahibi hangi masada kaç oyun oynandığını görebilir (gelecek özellik)

## 💡 İpuçları

- **Slug seçimi**: Kısa ve akılda kalıcı (örn: "merkez", "central")
- **Renk seçimi**: İşletmenizin marka renkleriyle uyumlu
- **Logo**: Şeffaf PNG kullanın, beyaz arka plan için optimize edin
- **Mesaj**: Kısa ve samimi tut (örn: "İyi oyunlar!")

## 🆘 Sorun Giderme

### QR kod çalışmıyor
- URL'in doğru olduğundan emin olun
- Slug'ın veritabanında var olduğunu kontrol edin
- Venue'nün `is_active` alanının `true` olduğunu kontrol edin

### Renk ve logo görünmüyor
- Tarayıcı cache'ini temizleyin
- localStorage'ı kontrol edin: `localStorage.getItem('currentVenue')`
- API endpoint'inin çalıştığını test edin: `/api/venues/slug-adi`

### Admin paneline erişilemiyor
- URL'nin doğru olduğundan emin olun: `/admin/venues`
- Geliştirme sunucusunun çalıştığını kontrol edin

## 📞 Destek

Sorun yaşarsanız:
1. Console loglarını kontrol edin
2. Network sekmesinde API isteklerini inceleyin
3. Supabase loglarını kontrol edin

