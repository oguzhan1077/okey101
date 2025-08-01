'use client';

import { useState, useEffect } from 'react';
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
  const [hasOngoingGame, setHasOngoingGame] = useState(false);
  const [ongoingGameData, setOngoingGameData] = useState<any>(null);
  const [dealerIndex, setDealerIndex] = useState<number>(0); // Dağıtan oyuncu indexi

  // Takım renkleri
  const teamColors = {
    team1: {
      name: 'text-blue-300',
      border: 'border-blue-600',
      bg: 'bg-blue-900/20',
      focus: 'focus:ring-blue-500 focus:border-blue-600'
    },
    team2: {
      name: 'text-purple-300',
      border: 'border-purple-600',
      bg: 'bg-purple-900/20',
      focus: 'focus:ring-purple-500 focus:border-purple-600'
    }
  };

  // localStorage'da devam eden oyun var mı kontrol et
  useEffect(() => {
    const checkOngoingGame = () => {
      try {
        const roundDetails = localStorage.getItem('roundDetails');
        if (roundDetails) {
          const gameData = JSON.parse(roundDetails);
          if (gameData && gameData.length > 0) {
            setHasOngoingGame(true);
            // Son round'dan oyun bilgilerini al (en güncel)
            const lastRound = gameData[gameData.length - 1];

            setOngoingGameData(lastRound);
          } else {
            setHasOngoingGame(false);
            setOngoingGameData(null);
          }
        } else {
          setHasOngoingGame(false);
          setOngoingGameData(null);
        }
      } catch (error) {
        console.error('localStorage kontrol hatası:', error);
        setHasOngoingGame(false);
        setOngoingGameData(null);
      }
    };

    checkOngoingGame();
  }, []);

  const handleReturnToGame = () => {
    if (ongoingGameData) {
      
      // Yeni veri formatı kullan, eski format için fallback
      const mode = ongoingGameData.mode || 'single';
      const player1 = ongoingGameData.player1 || (ongoingGameData.players && ongoingGameData.players[0]?.name) || '';
      const player2 = ongoingGameData.player2 || (ongoingGameData.players && ongoingGameData.players[1]?.name) || '';
      const player3 = ongoingGameData.player3 || (ongoingGameData.players && ongoingGameData.players[2]?.name) || '';
      const player4 = ongoingGameData.player4 || (ongoingGameData.players && ongoingGameData.players[3]?.name) || '';
      
      // Oyun verilerinden URL parametrelerini oluştur
      const params = new URLSearchParams({
        mode,
        player1,
        player2,
        player3,
        player4
      });

      if (mode === 'group' && ongoingGameData.group1 && ongoingGameData.group2) {
        params.append('group1', ongoingGameData.group1);
        params.append('group2', ongoingGameData.group2);
      }


      router.push(`/game?${params.toString()}`);
    }
  };

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
        player4,
        dealer: dealerIndex.toString(),
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
              <div>
                <input
                  type="text"
                  placeholder="1. Takım Adı"
                  value={group1Name}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Sadece harfler, sayılar, nokta ve virgüle izin ver
                    if (/^[a-zA-ZğĞıİşŞüÜöÖçÇ0-9., ]*$/.test(value)) {
                      setGroup1Name(value);
                    }
                  }}
                  maxLength={20}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white placeholder-gray-400 text-base"
                />
                <div className="flex justify-between items-center mt-1">
                  <div className="text-xs text-gray-500">Maksimum 20 karakter (sadece harf, sayı, nokta, virgül)</div>
                  <div className={`text-xs ${group1Name.length > 17 ? 'text-orange-400' : 'text-gray-500'}`}>
                    {group1Name.length}/20
                  </div>
                </div>
              </div>
              <div>
                <input
                  type="text"
                  placeholder="2. Takım Adı"
                  value={group2Name}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Sadece harfler, sayılar, nokta ve virgüle izin ver
                    if (/^[a-zA-ZğĞıİşŞüÜöÖçÇ0-9., ]*$/.test(value)) {
                      setGroup2Name(value);
                    }
                  }}
                  maxLength={20}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white placeholder-gray-400 text-base"
                />
                <div className="flex justify-between items-center mt-1">
                  <div className="text-xs text-gray-500">Maksimum 20 karakter (sadece harf, sayı, nokta, virgül)</div>
                  <div className={`text-xs ${group2Name.length > 17 ? 'text-orange-400' : 'text-gray-500'}`}>
                    {group2Name.length}/20
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Oyuncu İsimleri */}
        {gameMode && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">
              Oyuncu İsimleri <span className="text-xs text-gray-400">(Dealer seçin)</span>
            </h3>
            <div className="space-y-4">
              {gameMode === 'group' ? (
                <>
                  <div className="grid grid-cols-1 gap-4">
                    {[
                      { player: player1, setPlayer: setPlayer1, team: 'team1', teamName: group1Name, position: 1 },
                      { player: player2, setPlayer: setPlayer2, team: 'team2', teamName: group2Name, position: 2 },
                      { player: player3, setPlayer: setPlayer3, team: 'team1', teamName: group1Name, position: 3 },
                      { player: player4, setPlayer: setPlayer4, team: 'team2', teamName: group2Name, position: 4 }
                    ].map(({ player, setPlayer, team, teamName, position }, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="dealer"
                          checked={dealerIndex === idx}
                          onChange={() => setDealerIndex(idx)}
                          className="accent-green-500 w-4 h-4"
                          title="Dağıtan"
                        />
                        <div className="flex-1">
                          <div className={`text-xs font-medium mb-1 ${teamColors[team as keyof typeof teamColors].name}`}>
                            {teamName || `${team === 'team1' ? '1.' : '2.'} Takım`}
                          </div>
                          <input
                            type="text"
                            placeholder={`Oyuncu ${position}`}
                            value={player}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (/^[a-zA-ZğĞıİşŞüÜöÖçÇ0-9., ]*$/.test(value)) {
                                setPlayer(value);
                              }
                            }}
                            maxLength={20}
                            className={`w-full px-4 py-3 bg-gray-700 border-2 rounded-xl focus:ring-2 outline-none transition-colors text-white placeholder-gray-400 text-base ${teamColors[team as keyof typeof teamColors].border} ${teamColors[team as keyof typeof teamColors].focus}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4">
                    {[player1, player2, player3, player4].map((player, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="dealer"
                          checked={dealerIndex === idx}
                          onChange={() => setDealerIndex(idx)}
                          className="accent-green-500 w-4 h-4"
                          title="Dağıtan"
                        />
                        <input
                          type="text"
                          placeholder={`Oyuncu ${idx + 1}`}
                          value={eval(`player${idx + 1}`)}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (/^[a-zA-ZğĞıİşŞüÜöÖçÇ0-9., ]*$/.test(value)) {
                              eval(`setPlayer${idx + 1}`)(value);
                            }
                          }}
                          maxLength={20}
                          className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-white placeholder-gray-400 text-base"
                        />
                      </div>
                    ))}
                  </div>
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

        {/* Devam Eden Oyuna Dön Butonu */}
        {hasOngoingGame && (
          <button
            onClick={handleReturnToGame}
            className="w-full mt-4 py-4 px-6 rounded-xl font-semibold text-lg bg-orange-600 hover:bg-orange-500 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
          >
            🎮 Oyuna Dön
          </button>
        )}

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
