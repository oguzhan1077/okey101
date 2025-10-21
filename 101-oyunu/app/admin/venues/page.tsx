'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface Venue {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  welcome_message?: string;
  is_active: boolean;
}

export default function VenueAdmin() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    logo_url: '',
    primary_color: '#3B82F6',
    secondary_color: '#8B5CF6',
    welcome_message: '',
  });
  const [error, setError] = useState('');
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);

  // Auth kontrolü - giriş yapmamışsa login'e yönlendir
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadVenues();
    }
  }, [user]);

  const loadVenues = async () => {
    try {
      const response = await fetch('/api/venues');
      const data = await response.json();
      setVenues(data);
    } catch (error) {
      console.error('Venues yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      // Supabase'den auth token'ı al
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError('Oturum süresi dolmuş. Lütfen tekrar giriş yapın.');
        router.push('/login');
        return;
      }

      const response = await fetch('/api/venues', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setShowAddModal(false);
        setFormData({
          name: '',
          slug: '',
          logo_url: '',
          primary_color: '#3B82F6',
          secondary_color: '#8B5CF6',
          welcome_message: '',
        });
        loadVenues();
      } else {
        setError(data.error || 'Bir hata oluştu');
      }
    } catch (error) {
      setError('Sunucu hatası');
    }
  };

  const generateQRCode = async (venue: Venue) => {
    setSelectedVenue(venue);
    const url = `${window.location.origin}?venue=${venue.slug}`;
    
    // QRCode paketini dinamik import et
    const QRCode = (await import('qrcode')).default;
    
    try {
      const qrDataURL = await QRCode.toDataURL(url, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      setQrCodeDataURL(qrDataURL);
    } catch (error) {
      console.error('QR kod oluşturulamadı:', error);
    }
  };

  const downloadQRCode = () => {
    if (qrCodeDataURL && selectedVenue) {
      const link = document.createElement('a');
      link.download = `qr-${selectedVenue.slug}.png`;
      link.href = qrCodeDataURL;
      link.click();
    }
  };

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  // Auth yüklenirken veya kullanıcı yoksa loading göster
  if (authLoading || !user || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-white text-xl">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">İşletme Yönetimi</h1>
            <p className="text-gray-300">QR kodlar ile işletmeye özel deneyim oluşturun</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/"
              className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg transition-colors"
            >
              ← Ana Sayfa
            </Link>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              + Yeni İşletme Ekle
            </button>
          </div>
        </div>

        {/* Venues Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {venues.map((venue) => (
            <div
              key={venue.id}
              className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden"
            >
              {/* Venue Header */}
              <div
                className="h-24 flex items-center justify-center"
                style={{
                  background: `linear-gradient(to right, ${venue.primary_color}, ${venue.secondary_color})`,
                }}
              >
                {venue.logo_url ? (
                  <img
                    src={venue.logo_url}
                    alt={venue.name}
                    className="h-16 object-contain"
                  />
                ) : (
                  <h3 className="text-2xl font-bold text-white">{venue.name}</h3>
                )}
              </div>

              {/* Venue Body */}
              <div className="p-6">
                <h3 className="text-xl font-bold text-white mb-2">{venue.name}</h3>
                <p className="text-sm text-gray-400 mb-1">Slug: {venue.slug}</p>
                {venue.welcome_message && (
                  <p className="text-sm text-gray-300 mb-4 italic">"{venue.welcome_message}"</p>
                )}

                {/* URL */}
                <div className="mb-4 p-3 bg-gray-700 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">QR URL:</p>
                  <p className="text-sm text-blue-400 break-all">
                    {`${typeof window !== 'undefined' ? window.location.origin : ''}?venue=${venue.slug}`}
                  </p>
                </div>

                {/* Actions */}
                <button
                  onClick={() => generateQRCode(venue)}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <span>📱</span>
                  <span>QR Kod Oluştur</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {venues.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🏢</div>
            <h3 className="text-xl font-semibold text-white mb-2">Henüz işletme yok</h3>
            <p className="text-gray-400 mb-4">İlk işletmenizi ekleyerek başlayın</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              + İlk İşletmeyi Ekle
            </button>
          </div>
        )}
      </div>

      {/* Add Venue Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Yeni İşletme Ekle</h2>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setError('');
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    İşletme Adı *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        name: e.target.value,
                        slug: slugify(e.target.value),
                      });
                    }}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Örn: Merkez Kafe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Slug (URL) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: slugify(e.target.value) })}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="merkez-kafe"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    URL'de kullanılacak benzersiz isim (küçük harf, tire ile)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Logo URL
                  </label>
                  <input
                    type="url"
                    value={formData.logo_url}
                    onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="https://example.com/logo.png"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Ana Renk
                    </label>
                    <input
                      type="color"
                      value={formData.primary_color}
                      onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                      className="w-full h-12 bg-gray-700 border border-gray-600 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      İkincil Renk
                    </label>
                    <input
                      type="color"
                      value={formData.secondary_color}
                      onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                      className="w-full h-12 bg-gray-700 border border-gray-600 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Hoş Geldin Mesajı
                  </label>
                  <textarea
                    value={formData.welcome_message}
                    onChange={(e) => setFormData({ ...formData, welcome_message: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                    rows={3}
                    placeholder="Müşterilerinize gösterilecek hoş geldin mesajı"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setError('');
                    }}
                    className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-lg font-semibold transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-semibold transition-colors"
                  >
                    Oluştur
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrCodeDataURL && selectedVenue && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">{selectedVenue.name}</h2>
                <button
                  onClick={() => {
                    setQrCodeDataURL(null);
                    setSelectedVenue(null);
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="bg-white p-6 rounded-xl mb-6">
                <img src={qrCodeDataURL} alt="QR Code" className="w-full" />
              </div>

              <div className="space-y-3">
                <button
                  onClick={downloadQRCode}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <span>⬇️</span>
                  <span>QR Kodu İndir</span>
                </button>

                <div className="p-3 bg-gray-700 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">URL:</p>
                  <p className="text-sm text-blue-400 break-all">
                    {`${window.location.origin}?venue=${selectedVenue.slug}`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

