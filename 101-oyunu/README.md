# 101 Oyunu - Next.js Kart Oyunu

Bu proje [Next.js](https://nextjs.org) ve [Supabase](https://supabase.com) kullanılarak geliştirilmiş bir kart oyunu uygulamasıdır.

## Özellikler

- Multiplayer kart oyunu
- Supabase ile gerçek zamanlı veritabanı
- Modern React ve Next.js mimarisi
- TypeScript desteği
- Tailwind CSS ile responsive tasarım

## Geliştirme Ortamı Kurulumu

### 1. Dependencies Kurulumu

```bash
npm install
# veya
yarn install
```

### 2. Environment Variables Ayarı

`.env.local` dosyası oluşturun ve Supabase bilgilerinizi ekleyin:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Geliştirme Sunucusunu Başlatın

```bash
npm run dev
# veya
yarn dev
```

[http://localhost:3000](http://localhost:3000) adresinden uygulamayı görüntüleyebilirsiniz.

## Netlify'da Deployment

### 1. Projeyi GitHub'a Push Edin

```bash
git add .
git commit -m "Netlify deployment hazırlığı"
git push origin main
```

### 2. Netlify'da Site Oluşturun

1. [Netlify](https://netlify.com)'a giriş yapın
2. "New site from Git" seçeneğini tıklayın
3. GitHub repository'nizi seçin
4. Build ayarları otomatik olarak algılanacak

### 3. Environment Variables Ayarlayın

Netlify dashboard'da:
1. Site Settings > Environment Variables'a gidin
2. Aşağıdaki değişkenleri ekleyin:
   - `NEXT_PUBLIC_SUPABASE_URL`: Supabase proje URL'niz
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key'iniz

### 4. Deploy İşlemini Tamamlayın

- Netlify otomatik olarak build işlemini başlatacak
- `netlify.toml` dosyası deployment ayarlarını optimize edecek
- Site hazır olduğunda otomatik URL alacaksınız

## Teknik Detaylar

### Kullanılan Teknolojiler

- **Next.js 15.3.4** - React framework
- **React 19** - UI kütüphanesi
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Supabase** - Backend ve veritabanı
- **Netlify** - Hosting ve deployment

### Proje Yapısı

```
101-oyunu/
├── app/                 # Next.js App Router
├── components/          # React bileşenleri
├── context/            # React Context providers
├── lib/                # Utility fonksiyonlar ve Supabase config
├── public/             # Static dosyalar
└── netlify.toml        # Netlify deployment konfigürasyonu
```

## Sorun Giderme

### Build Hatası Alıyorsanız

1. `node_modules` ve `.next` klasörlerini silin:
   ```bash
   rm -rf node_modules .next
   npm install
   ```

2. Environment variables'ların doğru ayarlandığını kontrol edin

3. Netlify build log'larını inceleyin

### Supabase Bağlantı Sorunu

1. Supabase URL ve key'lerin doğru olduğundan emin olun
2. Supabase projenizin aktif olduğunu kontrol edin
3. Browser geliştirici konsolunda hata mesajlarını kontrol edin

## Destek

Herhangi bir sorun yaşarsanız:
1. GitHub Issues bölümünde yeni bir issue açın
2. Build log'larını ve hata mesajlarını paylaşın
3. Environment setup'ınızı kontrol edin

---

Projeyi beğendiyseniz ⭐ vermeyi unutmayın!
