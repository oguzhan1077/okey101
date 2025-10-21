# 🚀 Admin Paneli Hızlı Kurulum

## 1️⃣ Admin Email Listesi Ayarla

Proje kök dizininde `.env.local` dosyası oluştur (eğer yoksa):

```bash
# 101-oyunu/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Admin email listesi (virgülle ayır)
ADMIN_EMAILS=admin@example.com,owner@cafe.com
```

## 2️⃣ Uygulamayı Yeniden Başlat

```bash
cd 101-oyunu
npm run dev
```

## 3️⃣ Test Et

### ✅ Admin Kullanıcı Testi

1. Admin email ile kayıt ol/giriş yap
2. `/admin/venues` sayfasına git
3. "Yeni İşletme Ekle" butonu çalışmalı ✅
4. Venue başarıyla oluşturulmalı ✅

### ❌ Normal Kullanıcı Testi

1. Admin listesinde olmayan bir email ile kayıt ol
2. `/admin/venues` sayfasına git
3. "Yeni İşletme Ekle" butonu çalışmalı ama...
4. Form submit edildiğinde "Forbidden - Admin access required" hatası almalı ❌

### 🔓 Giriş Yapmayan Kullanıcı Testi

1. Logout ol veya incognito mode kullan
2. `/admin/venues` sayfasına gitmeye çalış
3. Otomatik olarak `/login` sayfasına yönlendirilmeli 🔓

## 🌐 Production Deployment

### Netlify
```
Site Settings → Environment Variables → Add Variable:
  Key: ADMIN_EMAILS
  Value: admin@example.com,owner@cafe.com
```

### Vercel
```
Project Settings → Environment Variables:
  Name: ADMIN_EMAILS
  Value: admin@example.com,owner@cafe.com
  Environment: Production, Preview, Development
```

## 📝 Notlar

- **ADMIN_EMAILS boşsa:** Herhangi bir giriş yapmış kullanıcı admin olur (güvensiz!)
- **Email büyük/küçük harf duyarlı:** Tam olarak eşleşmeli
- **Virgülle ayırma:** Boşluk bırakma, sadece virgül

## 🔍 Sorun Giderme

### "Forbidden" Hatası
- Email'in `.env.local` dosyasında doğru yazıldığından emin ol
- Uygulamayı yeniden başlat (environment değişkenleri değiştiyse)

### "Unauthorized" Hatası
- Kullanıcı giriş yapmamış olabilir
- Session süresi dolmuş olabilir → Tekrar giriş yap

### Admin Listesi Boş Uyarısı
- Console'da şu mesajı görüyorsan: `⚠️ ADMIN_EMAILS environment variable not set!`
- `.env.local` dosyasını oluştur ve `ADMIN_EMAILS` ekle
- Uygulamayı yeniden başlat

## ✨ Özet

✅ Frontend: Giriş kontrolü aktif
✅ Backend: Token + Email doğrulaması aktif
✅ Environment variable ile admin yönetimi aktif
✅ Production ready!

Daha detaylı bilgi için: `ADMIN_SECURITY.md`

