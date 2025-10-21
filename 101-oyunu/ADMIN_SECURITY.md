# 🔒 Admin Paneli Güvenlik Kılavuzu

## Genel Bakış

Admin paneli (`/admin/venues`) artık güvenli hale getirildi. Sadece yetkili kullanıcılar yeni işletme (venue) ekleyebilir.

## Güvenlik Katmanları

### 1. Frontend Güvenliği
- **Giriş Kontrolü**: Kullanıcı giriş yapmamışsa `/login` sayfasına yönlendirilir
- **Auth Context**: `useAuth` hook'u ile kullanıcı durumu kontrol edilir
- **Loading State**: Auth durumu yüklenene kadar sayfa gösterilmez

### 2. Backend Güvenliği
- **Token Doğrulama**: Her POST isteğinde `Authorization: Bearer <token>` header'ı kontrol edilir
- **Admin Kontrolü**: Kullanıcının email adresi `ADMIN_EMAILS` listesinde olmalıdır
- **Error Handling**: 
  - `401 Unauthorized`: Token yoksa veya geçersizse
  - `403 Forbidden`: Kullanıcı admin değilse

## Admin Email Listesi Yapılandırması

### `.env.local` Dosyası Oluştur

Proje kök dizininde `.env.local` dosyası oluşturun:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Admin Configuration
ADMIN_EMAILS=admin@example.com,owner@cafe.com,manager@business.com
```

### Admin Email Formatı

- **Virgülle Ayır**: Birden fazla email virgül ile ayrılmalı
- **Boşluk Yok**: Emailler arasında boşluk olmamalı (varsa otomatik temizlenir)
- **Küçük Harf**: Email adresleri büyük/küçük harf duyarlı

**Örnek:**
```env
ADMIN_EMAILS=admin@example.com,owner@cafe.com
```

### Boş Liste Durumu

Eğer `ADMIN_EMAILS` tanımlanmamışsa veya boşsa:
- ⚠️ **Herhangi bir giriş yapmış kullanıcı admin sayılır**
- Console'da uyarı mesajı gösterilir
- **Production'da mutlaka tanımlanmalı!**

## Kullanım Senaryoları

### Senaryo 1: Tek Admin
```env
ADMIN_EMAILS=admin@mycompany.com
```

### Senaryo 2: Birden Fazla Admin
```env
ADMIN_EMAILS=admin@company.com,manager@company.com,owner@company.com
```

### Senaryo 3: Geliştirme Ortamı (Herkese Açık)
```env
# ADMIN_EMAILS değişkenini tamamen silme veya boş bırak
# ADMIN_EMAILS=
```

## Deployment

### Netlify
1. Netlify Dashboard → Site Settings → Environment Variables
2. Yeni değişken ekle:
   - Key: `ADMIN_EMAILS`
   - Value: `admin@example.com,owner@cafe.com`

### Vercel
1. Vercel Dashboard → Project Settings → Environment Variables
2. Yeni değişken ekle:
   - Key: `ADMIN_EMAILS`
   - Value: `admin@example.com,owner@cafe.com`
   - Environments: Production, Preview, Development (seçimli)

### Docker / Self-hosted
```bash
docker run -e ADMIN_EMAILS="admin@example.com" your-app
```

## Test Etme

### 1. Admin Olmayan Kullanıcı
```bash
# Önce normal bir kullanıcı kaydı oluştur
# Sonra /admin/venues sayfasına git
# Venue eklemeye çalış
# Sonuç: "Forbidden - Admin access required" hatası
```

### 2. Admin Kullanıcı
```bash
# ADMIN_EMAILS listesindeki bir email ile kayıt ol/giriş yap
# /admin/venues sayfasına git
# Venue ekle
# Sonuç: Başarıyla oluşturulur
```

### 3. Giriş Yapmayan Kullanıcı
```bash
# Giriş yapmadan /admin/venues'e git
# Sonuç: Otomatik olarak /login'e yönlendirilir
```

## API Endpoint Davranışı

### `GET /api/venues`
- **Kimlik Doğrulama**: Gerekli değil
- **Erişim**: Herkes
- **Amaç**: QR kod sistemi için gerekli

### `POST /api/venues`
- **Kimlik Doğrulama**: Gerekli
- **Erişim**: Sadece `ADMIN_EMAILS` listesindeki kullanıcılar
- **Amaç**: Yeni venue oluşturma

## Güvenlik Best Practices

1. ✅ **Production'da mutlaka `ADMIN_EMAILS` tanımla**
2. ✅ **Email adreslerini güvenli tut** (version control'e `.env.local` ekleme!)
3. ✅ **Admin sayısını minimumda tut**
4. ✅ **Düzenli olarak admin listesini gözden geçir**
5. ✅ **Eski çalışanları listeden çıkar**

## Sorun Giderme

### "Unauthorized" Hatası
- Kullanıcı giriş yapmamış olabilir
- Session süresi dolmuş olabilir
- **Çözüm**: Tekrar giriş yap

### "Forbidden" Hatası
- Kullanıcı admin listesinde değil
- Email adresi yanlış yazılmış olabilir (büyük/küçük harf kontrolü yap)
- **Çözüm**: `.env.local` dosyasını kontrol et, email'i ekle

### "Admin email listesi boş" Uyarısı
- `ADMIN_EMAILS` environment variable tanımlanmamış
- **Çözüm**: `.env.local` dosyasına ekle ve uygulamayı yeniden başlat

## İleri Seviye: Database Tabanlı Admin Sistemi

Eğer daha gelişmiş bir admin sistemi istiyorsan, `admins` tablosu oluşturabilirsin:

```sql
-- Admins tablosu oluştur
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'admin', -- 'super_admin', 'admin', 'manager'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RLS politikaları
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view admins" ON admins
FOR SELECT USING (user_id = auth.uid());
```

Sonra API'de kontrol et:

```typescript
const { data: isAdmin } = await supabase
  .from('admins')
  .select('id')
  .eq('user_id', user.id)
  .single();

if (!isAdmin) {
  return NextResponse.json(
    { error: 'Forbidden - Admin access required' },
    { status: 403 }
  );
}
```

## Özet

✅ Admin paneli artık güvenli
✅ Frontend: Giriş kontrolü var
✅ Backend: Token ve email doğrulaması var
✅ Environment variable ile admin listesi yönetimi
✅ Production'da mutlaka `ADMIN_EMAILS` tanımla!

