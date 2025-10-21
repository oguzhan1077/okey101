# 🚀 QR Kod Sistemi - Hızlı Başlangıç

## ⚡ 3 Adımda Kurulum

### 1️⃣ Paketleri Yükle
```bash
cd 101-oyunu
npm install
```

### 2️⃣ Veritabanını Kur
1. [Supabase Dashboard](https://app.supabase.com) → SQL Editor
2. `supabase/migrations/001_create_venues.sql` dosyasının içeriğini yapıştır
3. Çalıştır ▶️

### 3️⃣ Uygulamayı Başlat
```bash
npm run dev
```

## 🏢 İlk İşletmeyi Ekle

1. Tarayıcıda aç: `http://localhost:3000/admin/venues`
2. "Yeni İşletme Ekle" ✚
3. Formu doldur:
   - Ad: **Merkez Kafe**
   - Slug: **merkez-kafe** (otomatik)
   - Renkler: İstediğin gibi seç 🎨
4. "Oluştur" 💾

## 📱 QR Kod Oluştur

1. Admin panelde işletmeyi bul
2. "QR Kod Oluştur" butonuna tıkla
3. "QR Kodu İndir" ⬇️
4. Yazdır ve masaya koy 🖨️

## ✅ Test Et

1. QR kodu telefon kamerasıyla tara
2. Uygulama açılacak - işletme logolu! 🎉
3. Oyunu başlat ve test et

---

## 📂 Oluşturulan Dosyalar

```
✅ supabase/migrations/001_create_venues.sql  # Database
✅ context/VenueContext.tsx                    # State
✅ app/api/venues/route.ts                     # API (List & Create)
✅ app/api/venues/[slug]/route.ts              # API (Get by slug)
✅ app/admin/venues/page.tsx                   # Admin UI
✅ app/layout.tsx                              # Provider eklendi
✅ app/page.tsx                                # QR desteği eklendi
✅ package.json                                # qrcode paketi eklendi
```

## 🔗 Önemli Linkler

- **Admin Panel**: `/admin/venues`
- **Ana Sayfa**: `/`
- **QR URL Format**: `?venue=slug-adi`

## 💡 Kullanım

**QR Kod URL'i:**
```
http://localhost:3000?venue=merkez-kafe
```

**Production:**
```
https://yourdomain.com?venue=merkez-kafe
```

## 🎯 Sonraki Adımlar

1. ✅ Test et - QR kod tarayarak dene
2. 📱 Mobilde test et
3. 🚀 Deploy et (Vercel/Netlify)
4. 🖨️ QR kodları yazdır
5. 📊 İstatistikleri izle (gelecek özellik)

## ❓ Sorun mu var?

Detaylı rehber için: **VENUE_SETUP.md**

---

**Hazır!** 🎉 Artık işletmeye özel 101 Oyunu deneyimi sunabilirsiniz!

