'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface GameHistory {
  game_id: string;
  user_id: string;
  venue_id: string | null;
  venue_name: string | null;
  game_mode: 'single' | 'group';
  player_count: number;
  team1_name: string | null;
  team2_name: string | null;
  winner_name: string;
  winner_type: string;
  total_rounds: number;
  created_at: string;
  finished_at: string;
  player_stats: any;
  total_okeys: number;
  total_penalties: number;
  total_finished_hands: number;
  highest_round_score: number;
  lowest_round_score: number;
  team1_total_score: number;
  team2_total_score: number;
}

interface UserProfile {
  id: string;
  total_games_played: number;
  total_games_won: number;
  total_rounds_played: number;
  favorite_mode: string;
}

export default function HistoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [games, setGames] = useState<GameHistory[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<GameHistory | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  const loadUserData = async () => {
    setIsLoading(true);
    try {
      // Profil bilgilerini yükle
      const profileRes = await fetch(`/api/user/profile?user_id=${user!.id}`);
      const profileData = await profileRes.json();
      setProfile(profileData);

      // Oyun geçmişini yükle
      const gamesRes = await fetch(`/api/user/games?user_id=${user!.id}`);
      const gamesData = await gamesRes.json();
      
      // Duplicate game_id'leri filtrele (aynı oyun birden fazla kez bitirildiyse)
      const uniqueGames = gamesData.filter((game: GameHistory, index: number, self: GameHistory[]) => 
        index === self.findIndex((g) => g.game_id === game.game_id)
      );
      
      setGames(uniqueGames);
    } catch (error) {
      console.error('Veri yükleme hatası:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Süre fonksiyonu kaldırıldı - artık gösterilmiyor

  const showGameDetail = (game: GameHistory) => {
    setSelectedGame(game);
    setShowDetailModal(true);
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-white text-xl">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="bg-gray-700 hover:bg-gray-600 text-white p-3 rounded-xl transition-colors"
            >
              ← Geri
            </Link>
            <h1 className="text-3xl font-bold text-white">Oyun Geçmişi</h1>
          </div>
        </div>

        {/* Profil Özeti */}
        {profile && (
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-4">📊 İstatistiklerim</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-700/50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-blue-400">{profile.total_games_played}</div>
                <div className="text-gray-300 text-sm mt-1">Toplam Oyun</div>
              </div>
              <div className="bg-gray-700/50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-green-400">{profile.total_games_won}</div>
                <div className="text-gray-300 text-sm mt-1">Kazanılan</div>
              </div>
              <div className="bg-gray-700/50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-purple-400">{profile.total_rounds_played}</div>
                <div className="text-gray-300 text-sm mt-1">Toplam Round</div>
              </div>
              <div className="bg-gray-700/50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-yellow-400">
                  {profile.total_games_played > 0 
                    ? Math.round((profile.total_games_won / profile.total_games_played) * 100) 
                    : 0}%
                </div>
                <div className="text-gray-300 text-sm mt-1">Kazanma Oranı</div>
              </div>
            </div>
          </div>
        )}

        {/* Oyun Listesi */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">🎮 Geçmiş Oyunlarım</h2>
          
          {games.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg mb-4">Henüz oyun oynamadınız</div>
              <Link
                href="/"
                className="inline-block bg-blue-600 hover:bg-blue-500 text-white py-3 px-6 rounded-xl font-semibold transition-colors"
              >
                İlk Oyunu Başlat
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {games.map((game) => (
                <div
                  key={game.game_id}
                  className="bg-gray-700/50 border border-gray-600 rounded-xl p-4 hover:bg-gray-700 transition-colors cursor-pointer"
                  onClick={() => showGameDetail(game)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      {/* Oyun Başlığı */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">
                          {game.game_mode === 'group' ? '👥' : '🎯'}
                        </span>
                        <div>
                          <h3 className="text-white font-bold">
                            {game.game_mode === 'group' 
                              ? `${game.team1_name} vs ${game.team2_name}`
                              : 'Tekli Oyun'}
                          </h3>
                          <p className="text-gray-400 text-sm">
                            {formatDate(game.created_at)}
                            {game.venue_name && ` • ${game.venue_name}`}
                          </p>
                        </div>
                      </div>

                      {/* Oyun Bilgileri */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                        <div className="text-sm">
                          <span className="text-gray-400">Kazanan:</span>
                          <span className="text-green-400 font-semibold ml-2">
                            {game.winner_name}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-400">Round:</span>
                          <span className="text-blue-400 font-semibold ml-2">
                            {game.total_rounds}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-400">Okey:</span>
                          <span className="text-yellow-400 font-semibold ml-2">
                            {game.total_okeys}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Detay Butonu */}
                    <div className="ml-4">
                      <button className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg transition-colors">
                        Detay →
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Oyun Detay Modal */}
      {showDetailModal && selectedGame && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">
                {selectedGame.game_mode === 'group' 
                  ? `${selectedGame.team1_name} vs ${selectedGame.team2_name}`
                  : 'Tekli Oyun - Detaylar'}
              </h2>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-white text-3xl"
              >
                ×
              </button>
            </div>

            {/* Genel Bilgiler */}
            <div className="mb-6">
              <h3 className="text-lg font-bold text-white mb-3">📋 Genel Bilgiler</h3>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <span className="text-gray-400">Tarih:</span>
                  <div className="text-white font-semibold">{formatDate(selectedGame.created_at)}</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <span className="text-gray-400">Toplam Round:</span>
                  <div className="text-white font-semibold">{selectedGame.total_rounds}</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <span className="text-gray-400">Kazanan:</span>
                  <div className="text-green-400 font-semibold">{selectedGame.winner_name}</div>
                </div>
              </div>
            </div>

            {/* İstatistikler */}
            <div className="mb-6">
              <h3 className="text-lg font-bold text-white mb-3">📊 Oyun İstatistikleri</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-400">{selectedGame.total_okeys}</div>
                  <div className="text-gray-400 mt-1">Toplam Okey</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-400">{selectedGame.total_penalties}</div>
                  <div className="text-gray-400 mt-1">Toplam Ceza</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">{selectedGame.total_finished_hands}</div>
                  <div className="text-gray-400 mt-1">Bitirilen El</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-400">{selectedGame.highest_round_score}</div>
                  <div className="text-gray-400 mt-1">En Yüksek Puan</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-purple-400">{selectedGame.lowest_round_score}</div>
                  <div className="text-gray-400 mt-1">En Düşük Puan</div>
                </div>
              </div>
            </div>

            {/* Takım Skorları - Ayrı Kartlar */}
            {selectedGame.game_mode === 'group' && (
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white mb-3">🏆 Takım Skorları</h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* Takım 1 */}
                  <div className={`rounded-lg p-4 text-center border-2 ${
                    selectedGame.team1_total_score < selectedGame.team2_total_score 
                      ? 'bg-green-900/20 border-green-500' 
                      : 'bg-gray-700/50 border-gray-600'
                  }`}>
                    <div className="text-gray-300 font-semibold mb-2">{selectedGame.team1_name}</div>
                    <div className={`text-4xl font-bold ${
                      selectedGame.team1_total_score < selectedGame.team2_total_score 
                        ? 'text-green-400' 
                        : 'text-red-400'
                    }`}>
                      {selectedGame.team1_total_score}
                    </div>
                    {selectedGame.team1_total_score < selectedGame.team2_total_score && (
                      <div className="text-green-400 text-sm mt-2">✓ Kazanan</div>
                    )}
                  </div>

                  {/* Takım 2 */}
                  <div className={`rounded-lg p-4 text-center border-2 ${
                    selectedGame.team2_total_score < selectedGame.team1_total_score 
                      ? 'bg-green-900/20 border-green-500' 
                      : 'bg-gray-700/50 border-gray-600'
                  }`}>
                    <div className="text-gray-300 font-semibold mb-2">{selectedGame.team2_name}</div>
                    <div className={`text-4xl font-bold ${
                      selectedGame.team2_total_score < selectedGame.team1_total_score 
                        ? 'text-green-400' 
                        : 'text-red-400'
                    }`}>
                      {selectedGame.team2_total_score}
                    </div>
                    {selectedGame.team2_total_score < selectedGame.team1_total_score && (
                      <div className="text-green-400 text-sm mt-2">✓ Kazanan</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Oyuncu İstatistikleri */}
            {selectedGame.player_stats && (
              <div>
                <h3 className="text-lg font-bold text-white mb-3">👥 Oyuncu Performansları (Sıralamalı)</h3>
                <div className="space-y-2">
                  {selectedGame.player_stats
                    .map((player: any, originalIndex: number) => ({ ...player, originalIndex }))
                    .sort((a: any, b: any) => a.total_score - b.total_score) // En düşük puan 1., en yüksek puan son
                    .map((player: any, sortedIndex: number) => {
                      // Takım rengini belirle (takım oyununda)
                      let teamColor = '#FFFFFF'; // Varsayılan beyaz
                      let borderColor = '#9CA3AF'; // Varsayılan gri
                      
                      if (selectedGame.game_mode === 'group') {
                        // Oyuncu Takım 1'de mi (index 0 veya 2)?
                        if (player.originalIndex === 0 || player.originalIndex === 2) {
                          teamColor = selectedGame.team1_total_score < selectedGame.team2_total_score ? '#10B981' : '#EF4444';
                          borderColor = teamColor;
                        }
                        // Oyuncu Takım 2'de mi (index 1 veya 3)?
                        else if (player.originalIndex === 1 || player.originalIndex === 3) {
                          teamColor = selectedGame.team2_total_score < selectedGame.team1_total_score ? '#10B981' : '#EF4444';
                          borderColor = teamColor;
                        }
                      } else {
                        // Tekli oyunda sıralama renklerine göre
                        borderColor = sortedIndex === 0 ? '#10B981' : sortedIndex === 1 ? '#3B82F6' : sortedIndex === 2 ? '#F59E0B' : '#EF4444';
                      }
                      
                      return (
                        <div key={player.name} className="bg-gray-700/50 rounded-lg p-3 border-l-4" style={{
                          borderLeftColor: borderColor
                        }}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold text-gray-400">
                                #{sortedIndex + 1}
                              </span>
                              <span className="font-bold" style={{ 
                                color: selectedGame.game_mode === 'group' ? teamColor : '#FFFFFF' 
                              }}>
                                {player.name}
                              </span>
                            </div>
                            <span className={`font-bold ${player.total_score < 101 ? 'text-green-400' : 'text-red-400'}`}>
                              {player.total_score} puan
                            </span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                            <div className="text-gray-300">
                              🎯 Okey: <span className="text-yellow-400 font-semibold">{player.okey_count}</span>
                            </div>
                            <div className="text-gray-300">
                              👤 Bireysel: <span className="text-orange-400 font-semibold">{player.individual_penalty || 0}</span>
                            </div>
                            <div className="text-gray-300">
                              👥 Takım: <span className="text-purple-400 font-semibold">{player.team_penalty || 0}</span>
                            </div>
                            <div className="text-gray-300">
                              ✅ Bitirdi: <span className="text-green-400 font-semibold">{player.finished_count}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Kapat Butonu */}
            <button
              onClick={() => setShowDetailModal(false)}
              className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-semibold transition-colors"
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

