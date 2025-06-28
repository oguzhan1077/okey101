'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [gameMode, setGameMode] = useState<'group' | 'single' | null>(null);
  const [group1Name, setGroup1Name] = useState('');
  const [group2Name, setGroup2Name] = useState('');
  const [player1, setPlayer1] = useState('');
  const [player2, setPlayer2] = useState('');
  const [player3, setPlayer3] = useState('');
  const [player4, setPlayer4] = useState('');

  const canStartGame = () => {
    if (gameMode === 'group') {
      return group1Name.trim() && group2Name.trim() && player1.trim() && player2.trim() && player3.trim() && player4.trim();
    } else if (gameMode === 'single') {
      return player1.trim() && player2.trim() && player3.trim() && player4.trim();
    }
    return false;
  };

  const handleStartGame = () => {
    if (canStartGame()) {
      const params = new URLSearchParams({
        mode: gameMode!,
        player1,
        player2,
        player3,
        player4
      });

      if (gameMode === 'group') {
        params.append('group1', group1Name);
        params.append('group2', group2Name);
      }

      router.push(`/game?${params.toString()}`);
    }
  };

  // Loading durumu
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-white text-xl">Yükleniyor...</div>
      </div>
    );
  }

  // Kullanıcı giriş yapmamışsa auth ekranları göster
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-8 text-center">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">101 Oyunu</h1>
              <p className="text-gray-300">Dijital skor takip uygulaması</p>
            </div>

            {/* Auth Butonları */}
            <div className="space-y-4">
              <Link
                href="/login"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-6 rounded-xl font-semibold transition-colors shadow-lg hover:shadow-xl block"
              >
                🔐 Giriş Yap
              </Link>
              
              <Link
                href="/register"
                className="w-full bg-green-600 hover:bg-green-500 text-white py-3 px-6 rounded-xl font-semibold transition-colors shadow-lg hover:shadow-xl block"
              >
                📝 Kayıt Ol
              </Link>
            </div>

            {/* Info */}
            <div className="mt-6 p-4 bg-blue-900/30 border border-blue-700 rounded-xl">
              <p className="text-blue-300 text-sm">
                Oyun geçmişinizi kaydetmek ve takip etmek için hesap oluşturun
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-8 w-full max-w-lg">
        {/* Kullanıcı Bilgisi ve Çıkış */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-sm text-gray-400">Hoş geldiniz</p>
            <p className="text-white font-medium">{user.email}</p>
          </div>
          <button
            onClick={signOut}
            className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition-colors text-sm"
          >
            Çıkış
          </button>
        </div>

        {/* Başlık */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">101 Oyunu</h1>
          <p className="text-gray-300">Dijital skor takibi</p>
        </div>

        {/* Oyun Modu Seçimi */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">Oyun Modu Seçin</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setGameMode('group')}
              className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                gameMode === 'group'
                  ? 'border-blue-400 bg-blue-900/50 text-blue-300 shadow-lg'
                  : 'border-gray-600 hover:border-gray-500 text-gray-300 hover:bg-gray-700/50'
              }`}
            >
              <div className="font-semibold mb-1">👥 Grup</div>
              <div className="text-sm opacity-75">2 Takım</div>
            </button>
            <button
              onClick={() => setGameMode('single')}
              className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                gameMode === 'single'
                  ? 'border-blue-400 bg-blue-900/50 text-blue-300 shadow-lg'
                  : 'border-gray-600 hover:border-gray-500 text-gray-300 hover:bg-gray-700/50'
              }`}
            >
              <div className="font-semibold mb-1">🎯 Tekli</div>
              <div className="text-sm opacity-75">4 Kişi</div>
            </button>
          </div>
        </div>

        {/* Grup İsimleri (Grup modunda) */}
        {gameMode === 'group' && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">Takım İsimleri</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="1. Takım Adı"
                value={group1Name}
                onChange={(e) => setGroup1Name(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white placeholder-gray-400"
              />
              <input
                type="text"
                placeholder="2. Takım Adı"
                value={group2Name}
                onChange={(e) => setGroup2Name(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white placeholder-gray-400"
              />
            </div>
          </div>
        )}

        {/* Oyuncu İsimleri */}
        {gameMode && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">
              Oyuncu İsimleri
            </h3>
            <div className="space-y-4">
              {gameMode === 'group' ? (
                <>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {group1Name || '1. Takım'} - 1. Oyuncu
                      </label>
                      <input
                        type="text"
                        placeholder="Oyuncu 1"
                        value={player1}
                        onChange={(e) => setPlayer1(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white placeholder-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {group2Name || '2. Takım'} - 1. Oyuncu
                      </label>
                      <input
                        type="text"
                        placeholder="Oyuncu 2"
                        value={player2}
                        onChange={(e) => setPlayer2(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white placeholder-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {group1Name || '1. Takım'} - 2. Oyuncu
                      </label>
                      <input
                        type="text"
                        placeholder="Oyuncu 3"
                        value={player3}
                        onChange={(e) => setPlayer3(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white placeholder-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {group2Name || '2. Takım'} - 2. Oyuncu
                      </label>
                      <input
                        type="text"
                        placeholder="Oyuncu 4"
                        value={player4}
                        onChange={(e) => setPlayer4(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white placeholder-gray-400"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="1. Oyuncu"
                    value={player1}
                    onChange={(e) => setPlayer1(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white placeholder-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="2. Oyuncu"
                    value={player2}
                    onChange={(e) => setPlayer2(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white placeholder-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="3. Oyuncu"
                    value={player3}
                    onChange={(e) => setPlayer3(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white placeholder-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="4. Oyuncu"
                    value={player4}
                    onChange={(e) => setPlayer4(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white placeholder-gray-400"
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* Oyunu Başlat Butonu */}
        <button
          onClick={handleStartGame}
          disabled={!canStartGame()}
          className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all duration-200 ${
            canStartGame()
              ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
              : 'bg-gray-600 cursor-not-allowed text-gray-400'
          }`}
        >
          🚀 Oyunu Başlat
        </button>

        {/* Oyun Kuralları İpucu */}
        <div className="mt-8 p-4 bg-blue-900/30 border border-blue-800 rounded-xl">
          <h4 className="font-semibold text-blue-300 mb-2">💡 Oyun Hakkında</h4>
          <p className="text-sm text-blue-200 leading-relaxed">
            101 oyunu 4 kişiyle oynanır. Grup modunda karşılıklı oturan oyuncular takım olur.
            Tekli modunda herkes kendi için oynar.
          </p>
        </div>
      </div>
    </div>
  );
}
