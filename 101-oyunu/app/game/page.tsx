'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface Player {
  name: string;
  scores: number[];
}

interface RoundDetail {
  round: number;
  players: {
    name: string;
    points: number;
    penalty: number;
    hasOkey1: boolean;
    hasOkey2: boolean;
    finished: boolean;
    total: number;
  }[];
}

interface GameData {
  gameMode: 'group' | 'single';
  group1Name?: string;
  group2Name?: string;
  players: string[];
}

export default function GamePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [showCalculation, setShowCalculation] = useState(false);
  const [selectedRoundDetails, setSelectedRoundDetails] = useState<number | null>(null);
  const [roundDetails, setRoundDetails] = useState<RoundDetail[]>([]);
  const [showGameEndModal, setShowGameEndModal] = useState(false);
  const [gameEndData, setGameEndData] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editRoundData, setEditRoundData] = useState<RoundDetail | null>(null);

  useEffect(() => {
    // URL parametrelerinden oyun verilerini al
    const mode = searchParams.get('mode') as 'group' | 'single';
    const group1 = searchParams.get('group1');
    const group2 = searchParams.get('group2');
    const scores = searchParams.get('scores');
    const round = searchParams.get('round');
    const playerNames = [
      searchParams.get('player1'),
      searchParams.get('player2'),
      searchParams.get('player3'),
      searchParams.get('player4')
    ].filter(Boolean) as string[];

    if (mode && playerNames.length === 4) {
      const data: GameData = {
        gameMode: mode,
        players: playerNames
      };
      
      if (mode === 'group') {
        data.group1Name = group1 || '1. Takım';
        data.group2Name = group2 || '2. Takım';
      }

      setGameData(data);
      
      // localStorage'dan round detaylarını yükle
      const storedDetails = JSON.parse(localStorage.getItem('roundDetails') || '[]');
      setRoundDetails(storedDetails);

      // Oyuncuları ve skorları ayarla
      let initialPlayers: Player[] = playerNames.map(name => ({ name, scores: [] as number[] }));
      let nextRound = 1;

      // Eğer yeni scores geliyorsa, ekle
      if (scores && round) {
        const newScores = scores.split(',').map(s => parseInt(s));
        const roundNum = parseInt(round);
        
        // Mevcut skorları storedDetails'dan al
        storedDetails.forEach((detail: RoundDetail) => {
          if (detail.round <= roundNum) {
            detail.players.forEach((player, index) => {
              if (!initialPlayers[index].scores[detail.round - 1]) {
                initialPlayers[index].scores[detail.round - 1] = player.total;
              }
            });
          }
        });
        
        nextRound = roundNum + 1;
      } else {
        // Sadece mevcut detaylardan skorları yükle
        storedDetails.forEach((detail: RoundDetail) => {
          detail.players.forEach((player, index) => {
            initialPlayers[index].scores[detail.round - 1] = player.total;
          });
          nextRound = Math.max(nextRound, detail.round + 1);
        });
      }

      setPlayers(initialPlayers);
      setCurrentRound(nextRound);
    }
  }, [searchParams]);

  const goToRoundPage = () => {
    if (!gameData) return;
    setShowCalculation(false); // Yeni round'a giderken hesaplamayı kapat

    const params = new URLSearchParams({
      mode: gameData.gameMode,
      player1: gameData.players[0],
      player2: gameData.players[1],
      player3: gameData.players[2],
      player4: gameData.players[3],
      round: currentRound.toString()
    });

    if (gameData.gameMode === 'group') {
      params.append('group1', gameData.group1Name!);
      params.append('group2', gameData.group2Name!);
    }

    router.push(`/game/round?${params.toString()}`);
  };

  const calculateTotals = () => {
    setShowCalculation(true);
  };



  const getTotalScore = (playerIndex: number) => {
    return players[playerIndex]?.scores.reduce((sum, score) => sum + score, 0) || 0;
  };

  const getGroupScores = () => {
    if (!gameData || gameData.gameMode !== 'group') return null;
    
    const group1Total = getTotalScore(0) + getTotalScore(2); // Player 1 & 3
    const group2Total = getTotalScore(1) + getTotalScore(3); // Player 2 & 4
    
    return {
      group1: { name: gameData.group1Name!, total: group1Total },
      group2: { name: gameData.group2Name!, total: group2Total }
    };
  };

  const finishGame = () => {
    const groupScores = getGroupScores();
    let endData: any = {
      isGroup: !!groupScores,
      playerScores: players.map((player, index) => ({
        name: player.name,
        score: getTotalScore(index)
      }))
    };
    
    if (groupScores) {
      endData.groupScores = groupScores;
      
      // En az puana sahip takım kazanır
      if (groupScores.group1.total < groupScores.group2.total) {
        endData.winner = groupScores.group1.name;
        endData.winnerType = 'group1';
      } else if (groupScores.group2.total < groupScores.group1.total) {
        endData.winner = groupScores.group2.name;
        endData.winnerType = 'group2';
      } else {
        endData.winner = 'Berabere';
        endData.winnerType = 'tie';
      }
    } else {
      // Tekil modda: En az puandan en çok puana doğru sıralama
      const playerRankings = players.map((player, index) => ({
        name: player.name,
        score: getTotalScore(index),
        originalIndex: index
      })).sort((a, b) => a.score - b.score); // En az puandan başlayarak sırala
      
      endData.rankings = playerRankings.map((player, index) => ({
        ...player,
        rank: index + 1
      }));
      
      // Kazanan en az puanlı oyuncu
      endData.winner = playerRankings[0].name;
      endData.winnerType = 'single';
      endData.winnerScore = playerRankings[0].score;
    }
    
    setGameEndData(endData);
    setShowGameEndModal(true);
  };

  const startNewGame = () => {
    // Tüm localStorage verilerini temizle
    localStorage.removeItem('roundDetails');
    
    // Ana sayfaya git
    router.push('/');
  };

  const getRoundDetail = (roundIndex: number) => {
    return roundDetails.find(detail => detail.round === roundIndex + 1);
  };

  const startEditRound = (roundIndex: number) => {
    const detail = getRoundDetail(roundIndex);
    if (detail) {
      setEditRoundData(JSON.parse(JSON.stringify(detail))); // Deep copy
      setIsEditMode(true);
    }
  };

  const saveRoundEdit = () => {
    if (!editRoundData) return;

    // Update round details in localStorage
    const updatedDetails = roundDetails.map(detail => 
      detail.round === editRoundData.round ? editRoundData : detail
    );
    setRoundDetails(updatedDetails);
    localStorage.setItem('roundDetails', JSON.stringify(updatedDetails));

    // Update player scores
    const updatedPlayers = players.map((player, index) => {
      const newScores = [...player.scores];
      newScores[editRoundData.round - 1] = editRoundData.players[index].total;
      return { ...player, scores: newScores };
    });
    setPlayers(updatedPlayers);

    setIsEditMode(false);
    setEditRoundData(null);
    setShowCalculation(false); // Reset calculation display
  };

  const cancelRoundEdit = () => {
    setIsEditMode(false);
    setEditRoundData(null);
  };

  const updateEditPlayerData = (playerIndex: number, field: string, value: any) => {
    if (!editRoundData) return;

    const updatedPlayers = editRoundData.players.map((player, index) => {
      if (index === playerIndex) {
        const updatedPlayer = { ...player, [field]: value };
        
        // Recalculate total
        let total = updatedPlayer.points + updatedPlayer.penalty;
        if (updatedPlayer.finished) {
          total -= 101;
        }
        updatedPlayer.total = total;
        
        return updatedPlayer;
      }
      return player;
    });

    setEditRoundData({ ...editRoundData, players: updatedPlayers });
  };

  if (!gameData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-gray-300 text-xl">Oyun verileri yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-4 md:p-6">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-4 md:mb-6 text-center">101 Oyunu</h1>
          
          {/* Oyuncu Kartları - Mobil Optimize */}
          <div className="grid grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
            {players.map((player, index) => {
              const isGroup1 = index === 0 || index === 2;
              
              return (
                <div 
                  key={index} 
                  className={`text-center p-2 md:p-4 rounded-xl border-2 transition-all ${
                    gameData.gameMode === 'group'
                      ? isGroup1 
                        ? 'bg-blue-900/20 border-blue-600 hover:bg-blue-900/30' 
                        : 'bg-purple-900/20 border-purple-600 hover:bg-purple-900/30'
                      : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                  }`}
                >
                  {/* Oyuncu İsmi */}
                  <div className="text-sm md:text-lg font-semibold text-white truncate">
                    {player.name}
                  </div>
                  
                  {/* Takım Bilgisi */}
                  {gameData.gameMode === 'group' && (
                    <div className={`text-xs md:text-sm mt-1 ${
                      isGroup1 ? 'text-blue-300' : 'text-purple-300'
                    }`}>
                      {isGroup1 ? gameData.group1Name : gameData.group2Name}
                    </div>
                  )}
                  
                  {/* Puan - Sadece hesaplama gösterilirken */}
                  {showCalculation && (
                    <div className="mt-2 md:mt-3">
                      <div className={`text-lg md:text-2xl font-bold ${
                        getTotalScore(index) > 0 ? 'text-red-400' : getTotalScore(index) < 0 ? 'text-green-400' : 'text-gray-300'
                      }`}>
                        {getTotalScore(index)}
                      </div>
                      <div className="text-xs text-gray-400">puan</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Grup Skorları (Grup modunda ve hesaplama gösterilirken) */}
          {showCalculation && gameData.gameMode === 'group' && (() => {
            const groupScores = getGroupScores()!;
            return (
              <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4 md:mb-6">
                <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 border-2 border-blue-600 rounded-xl p-3 md:p-6 text-center">
                  <div className="text-sm md:text-lg font-semibold text-blue-300">{groupScores.group1.name}</div>
                  <div className="text-2xl md:text-4xl font-bold text-blue-400 mt-1 md:mt-2">{groupScores.group1.total}</div>
                  <div className="text-xs text-blue-300">toplam</div>
                </div>
                <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 border-2 border-purple-600 rounded-xl p-3 md:p-6 text-center">
                  <div className="text-sm md:text-lg font-semibold text-purple-300">{groupScores.group2.name}</div>
                  <div className="text-2xl md:text-4xl font-bold text-purple-400 mt-1 md:mt-2">{groupScores.group2.total}</div>
                  <div className="text-xs text-purple-300">toplam</div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Round Geçmişi */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold text-white mb-4 text-center">Round Geçmişi</h2>
          
          {players[0]?.scores.length === 0 ? (
            <div className="text-gray-400 text-center py-8 md:py-12 bg-gray-700 border border-gray-600 rounded-xl">
              <div className="text-3xl md:text-4xl mb-2">🎯</div>
              <p className="text-sm md:text-base">Henüz oynanmış round bulunmuyor</p>
              <p className="text-xs md:text-sm mt-1">İlk round'u ekleyerek başlayın!</p>
            </div>
          ) : (
            <div className="bg-gray-700 border border-gray-600 rounded-xl overflow-hidden">
              {/* Header - Oyuncu İsimleri */}
              <div className="bg-gray-600 p-3 border-b border-gray-500">
                <div className="grid grid-cols-5 gap-2 md:gap-3">
                  <div className="text-gray-300 font-semibold text-xs md:text-sm text-center">Round</div>
                  {players.map((player, playerIndex) => {
                    const isGroup1 = playerIndex === 0 || playerIndex === 2;
                    return (
                      <div key={playerIndex} className="text-center">
                        <div className={`font-semibold text-xs md:text-sm truncate ${
                          gameData.gameMode === 'group'
                            ? isGroup1 ? 'text-blue-300' : 'text-purple-300'
                            : 'text-gray-300'
                        }`}>
                          {player.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rounds - Sadece Puanlar */}
              <div className="space-y-1">
                {players[0].scores.map((_, roundIndex) => (
                  <div key={roundIndex} className="p-2 md:p-3 hover:bg-gray-650 transition-colors">
                    <div className="grid grid-cols-5 gap-2 md:gap-3 items-center">
                      {/* Round Number + Detail Button */}
                      <div className="flex items-center justify-center space-x-2">
                        <span className="text-white font-medium text-sm">{roundIndex + 1}</span>
                        <div className="flex space-x-1">
                          <button
                            onClick={() => {
                              setSelectedRoundDetails(selectedRoundDetails === roundIndex ? null : roundIndex);
                              setShowCalculation(false); // Detay açıldığında hesaplamayı kapat
                              setIsEditMode(false); // Edit modu kapat
                            }}
                            className="bg-blue-600 hover:bg-blue-500 text-white p-1 rounded transition-colors"
                            title="Detayları Gör"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              startEditRound(roundIndex);
                              setSelectedRoundDetails(null);
                              setShowCalculation(false);
                            }}
                            className="bg-orange-600 hover:bg-orange-500 text-white p-1 rounded transition-colors"
                            title="Düzenle"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Player Scores */}
                      {players.map((player, playerIndex) => {
                        const score = player.scores[roundIndex];
                        return (
                          <div key={playerIndex} className="text-center">
                            <div className={`font-bold text-sm md:text-base ${
                              score > 0 ? 'text-red-400' : score < 0 ? 'text-green-400' : 'text-gray-300'
                            }`}>
                              {score}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Yeni Round Ekleme */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4 text-center">
            Round {currentRound}
          </h2>
          <p className="text-sm md:text-base text-gray-300 mb-4 text-center">
            Yeni round eklemek için butona tıklayın
          </p>
          
          <button
            onClick={goToRoundPage}
            className="w-full bg-green-600 hover:bg-green-500 text-white py-3 md:py-4 px-4 md:px-6 rounded-xl font-semibold text-base md:text-lg transition-all shadow-lg hover:shadow-xl flex items-center justify-center space-x-2 hover:scale-105"
          >
            <span className="text-xl md:text-2xl">+</span>
            <span>Yeni Round Ekle</span>
          </button>
        </div>

        {/* Aksiyon Butonları */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <button
            onClick={() => {
              calculateTotals();
              setSelectedRoundDetails(null); // Hesapla butonuna basınca detayı kapat
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white py-3 md:py-4 px-4 md:px-6 rounded-xl font-semibold text-base md:text-lg transition-all shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center space-x-2"
          >
            <span className="text-xl">📊</span>
            <span>Skorları Hesapla</span>
          </button>

          <button
            onClick={() => {
              finishGame();
              setShowCalculation(false); // Oyun bitince hesaplamayı kapat
            }}
            className="bg-red-600 hover:bg-red-500 text-white py-3 md:py-4 px-4 md:px-6 rounded-xl font-semibold text-base md:text-lg transition-all shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center space-x-2"
          >
            <span className="text-xl">🏁</span>
            <span>Oyunu Bitir</span>
          </button>

          <button
            onClick={() => {
              startNewGame();
              setShowCalculation(false); // Yeni oyun başlarken hesaplamayı kapat
            }}
            className="bg-gray-600 hover:bg-gray-500 text-white py-3 md:py-4 px-4 md:px-6 rounded-xl font-semibold text-base md:text-lg transition-all shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center space-x-2"
          >
            <span className="text-xl">🎮</span>
            <span>Yeni Oyun</span>
          </button>
        </div>
      </div>

      {/* Round Detay Modal */}
      {selectedRoundDetails !== null && (() => {
        const detail = getRoundDetail(selectedRoundDetails);
        return (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-2 md:p-4 z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto">
              <div className="p-4 md:p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4 md:mb-6">
                  <h3 className="text-lg md:text-xl font-semibold text-white">
                    Round {selectedRoundDetails + 1} - Detaylar
                  </h3>
                  <button
                    onClick={() => setSelectedRoundDetails(null)}
                    className="bg-red-600 hover:bg-red-500 text-white p-2 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                {detail ? (
                  <div className="space-y-4">
                    {/* Compact Table Layout - Mobile Friendly */}
                    <div className="bg-gray-700 border border-gray-600 rounded-xl overflow-hidden">
                      {/* Table Header */}
                      <div className="bg-gray-600 grid grid-cols-6 gap-2 p-3 text-xs md:text-sm font-semibold">
                        <div className="text-gray-300 text-center">Oyuncu</div>
                        <div className="text-gray-300 text-center">Puan</div>
                        <div className="text-gray-300 text-center">Ceza</div>
                        <div className="text-gray-300 text-center">Okey</div>
                        <div className="text-gray-300 text-center">Bitirdi</div>
                        <div className="text-gray-300 text-center">Toplam</div>
                      </div>

                      {/* Table Rows */}
                      {detail.players.map((player, index) => {
                        const isGroup1 = index === 0 || index === 2;
                        return (
                          <div 
                            key={index} 
                            className={`grid grid-cols-6 gap-2 p-3 border-b border-gray-600 last:border-b-0 ${
                              gameData?.gameMode === 'group'
                                ? isGroup1 
                                  ? 'bg-blue-900/10' 
                                  : 'bg-purple-900/10'
                                : ''
                            }`}
                          >
                            {/* Player Name */}
                            <div className="text-center">
                              <div className={`font-semibold text-sm ${
                                gameData?.gameMode === 'group'
                                  ? isGroup1 ? 'text-blue-300' : 'text-purple-300'
                                  : 'text-white'
                              }`}>
                                {player.name}
                              </div>
                            </div>

                            {/* Points */}
                            <div className="text-center">
                              <div className={`font-bold text-sm ${
                                player.points > 0 ? 'text-red-400' : player.points < 0 ? 'text-green-400' : 'text-gray-300'
                              }`}>
                                {player.points}
                              </div>
                            </div>

                            {/* Penalty */}
                            <div className="text-center">
                              <div className="font-bold text-sm text-red-400">
                                {player.penalty}
                              </div>
                            </div>

                            {/* Okey */}
                            <div className="text-center">
                              <div className="font-bold text-sm text-amber-400">
                                {[player.hasOkey1 && '1', player.hasOkey2 && '2'].filter(Boolean).join(',') || '-'}
                              </div>
                            </div>

                            {/* Finished */}
                            <div className="text-center">
                              <div className={`font-bold text-sm ${player.finished ? 'text-green-400' : 'text-gray-400'}`}>
                                {player.finished ? '✓' : '-'}
                              </div>
                            </div>

                            {/* Total */}
                            <div className="text-center">
                              <div className={`font-bold text-lg ${
                                player.total > 0 ? 'text-red-400' : player.total < 0 ? 'text-green-400' : 'text-gray-300'
                              }`}>
                                {player.total}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Calculation Summary */}
                    <div className="p-3 bg-gray-700/50 border border-gray-600 rounded-xl">
                      <div className="text-center text-sm text-gray-300">
                        <p>Puan + Ceza {detail.players.some(p => p.finished) ? '- Bitirme Bonusu (-101)' : ''} = Toplam</p>
                        {detail.players.some(p => p.hasOkey1 || p.hasOkey2) && (
                          <p className="mt-1">🎯 Okey: {detail.players.filter(p => p.hasOkey1 || p.hasOkey2).map(p => p.name).join(', ')}</p>
                        )}
                        {detail.players.some(p => p.finished) && (
                          <p className="mt-1">🏁 Bitiren: {detail.players.filter(p => p.finished).map(p => p.name).join(', ')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-center py-12">
                    <div className="text-4xl mb-4">❌</div>
                    <p>Detay bulunamadı</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Round Modal */}
      {isEditMode && editRoundData && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-2 md:p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto">
            <div className="p-4 md:p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h3 className="text-lg md:text-xl font-semibold text-white">
                  Round {editRoundData.round} - Düzenle
                </h3>
                <div className="flex space-x-2">
                  <button
                    onClick={saveRoundEdit}
                    className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg transition-colors font-medium"
                  >
                    💾 Kaydet
                  </button>
                  <button
                    onClick={cancelRoundEdit}
                    className="bg-red-600 hover:bg-red-500 text-white p-2 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Edit Form - Compact Layout */}
              <div className="bg-gray-700 border border-gray-600 rounded-xl overflow-hidden">
                {/* Table Header */}
                <div className="bg-gray-600 grid grid-cols-6 gap-2 p-3 text-xs md:text-sm font-semibold">
                  <div className="text-gray-300 text-center">Oyuncu</div>
                  <div className="text-gray-300 text-center">Puan</div>
                  <div className="text-gray-300 text-center">Ceza</div>
                  <div className="text-gray-300 text-center">Okey</div>
                  <div className="text-gray-300 text-center">Bitirdi</div>
                  <div className="text-gray-300 text-center">Toplam</div>
                </div>

                {/* Edit Rows */}
                {editRoundData.players.map((player, index) => {
                  const isGroup1 = index === 0 || index === 2;
                  return (
                    <div 
                      key={index} 
                      className={`grid grid-cols-6 gap-2 p-3 border-b border-gray-600 last:border-b-0 ${
                        gameData?.gameMode === 'group'
                          ? isGroup1 
                            ? 'bg-blue-900/10' 
                            : 'bg-purple-900/10'
                          : ''
                      }`}
                    >
                      {/* Player Name */}
                      <div className="text-center flex items-center justify-center">
                        <div className={`font-semibold text-sm ${
                          gameData?.gameMode === 'group'
                            ? isGroup1 ? 'text-blue-300' : 'text-purple-300'
                            : 'text-white'
                        }`}>
                          {player.name}
                        </div>
                      </div>

                      {/* Points */}
                      <div className="text-center">
                        <input
                          type="number"
                          value={player.points}
                          onChange={(e) => updateEditPlayerData(index, 'points', parseInt(e.target.value) || 0)}
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-center text-sm"
                          min="-999"
                          max="999"
                        />
                      </div>

                      {/* Penalty */}
                      <div className="text-center">
                        <input
                          type="number"
                          value={player.penalty}
                          onChange={(e) => updateEditPlayerData(index, 'penalty', parseInt(e.target.value) || 0)}
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-center text-sm"
                          min="0"
                          step="101"
                        />
                      </div>

                      {/* Okey */}
                      <div className="text-center flex justify-center space-x-1">
                        <button
                          onClick={() => updateEditPlayerData(index, 'hasOkey1', !player.hasOkey1)}
                          className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
                            player.hasOkey1
                              ? 'bg-amber-600 text-white'
                              : 'bg-amber-900/30 border border-amber-700 text-amber-300'
                          }`}
                        >
                          1
                        </button>
                        <button
                          onClick={() => updateEditPlayerData(index, 'hasOkey2', !player.hasOkey2)}
                          className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
                            player.hasOkey2
                              ? 'bg-amber-600 text-white'
                              : 'bg-amber-900/30 border border-amber-700 text-amber-300'
                          }`}
                        >
                          2
                        </button>
                      </div>

                      {/* Finished */}
                      <div className="text-center">
                        <button
                          onClick={() => updateEditPlayerData(index, 'finished', !player.finished)}
                          className={`w-8 h-6 rounded text-xs font-bold transition-colors ${
                            player.finished
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-600 border border-gray-500 text-gray-300'
                          }`}
                        >
                          {player.finished ? '✓' : '-'}
                        </button>
                      </div>

                      {/* Total */}
                      <div className="text-center flex items-center justify-center">
                        <div className={`font-bold text-lg ${
                          player.total > 0 ? 'text-red-400' : player.total < 0 ? 'text-green-400' : 'text-gray-300'
                        }`}>
                          {player.total}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Help Text */}
              <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700 rounded-xl">
                <div className="text-center text-sm text-blue-300">
                  <p>💡 Toplam = Puan + Ceza - (Bitirme Bonusu: -101)</p>
                  <p className="mt-1">Değişiklikleri kaydetmek için "Kaydet" butonuna basın</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Oyun Bitiş Modalı */}
      {showGameEndModal && gameEndData && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-8 text-center">
              {/* Başlık */}
              <div className="mb-8">
                <div className="text-6xl mb-4">
                  {gameEndData.winnerType === 'tie' ? '🤝' : '🏆'}
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">
                  {gameEndData.winnerType === 'tie' ? 'Berabere!' : 'Oyun Bitti!'}
                </h2>
                <p className="text-gray-300">Tebrikler!</p>
              </div>

              {/* Kazanan */}
              <div className="mb-8 p-6 bg-gradient-to-r from-yellow-900/50 to-amber-900/50 border border-yellow-700 rounded-2xl">
                <div className="text-lg text-yellow-300 mb-2">
                  {gameEndData.winnerType === 'tie' ? 'Sonuç' : 'Kazanan'}
                </div>
                <div className="text-2xl font-bold text-yellow-400 mb-2">
                  {gameEndData.winner}
                </div>
                {gameEndData.winnerType === 'single' && gameEndData.winnerScore !== undefined && (
                  <div className="text-sm text-yellow-200">
                    En az puan: {gameEndData.winnerScore}
                  </div>
                )}
                {gameEndData.winnerType !== 'tie' && (
                  <div className="text-xs text-yellow-200/70 mt-2">
                    🎯 En az puan alan kazanır!
                  </div>
                )}
              </div>

              {/* Sonuçlar */}
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-white mb-4">Final Skorları</h3>
                
                {gameEndData.isGroup ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className={`p-4 rounded-xl border-2 ${
                        gameEndData.winnerType === 'group1' 
                          ? 'border-green-500 bg-green-900/30' 
                          : 'border-gray-600 bg-gray-700'
                      }`}>
                        <div className="font-semibold text-blue-300 mb-2">
                          {gameEndData.groupScores.group1.name}
                        </div>
                        <div className="text-2xl font-bold text-white">
                          {gameEndData.groupScores.group1.total}
                        </div>
                      </div>
                      <div className={`p-4 rounded-xl border-2 ${
                        gameEndData.winnerType === 'group2' 
                          ? 'border-green-500 bg-green-900/30' 
                          : 'border-gray-600 bg-gray-700'
                      }`}>
                        <div className="font-semibold text-purple-300 mb-2">
                          {gameEndData.groupScores.group2.name}
                        </div>
                        <div className="text-2xl font-bold text-white">
                          {gameEndData.groupScores.group2.total}
                        </div>
                      </div>
                    </div>
                    
                    {/* Oyuncu Detayları */}
                    <div className="pt-4 border-t border-gray-600">
                      <div className="text-sm text-gray-400 mb-3">Oyuncu Detayları</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {gameEndData.playerScores.map((player: any, index: number) => (
                          <div key={index} className="flex justify-between bg-gray-700 rounded-lg p-2">
                            <span className="text-gray-300">{player.name}</span>
                            <span className="text-white font-medium">{player.score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {gameEndData.rankings ? (
                      // Yeni sıralama sistemi - En az puandan en çok puana
                      gameEndData.rankings.map((player: any, index: number) => (
                        <div key={index} className={`flex justify-between items-center p-4 rounded-xl border-2 ${
                          player.rank === 1
                            ? 'border-green-500 bg-green-900/30' 
                            : 'border-gray-600 bg-gray-700'
                        }`}>
                          <div className="flex items-center space-x-3">
                            <div className="text-2xl min-w-[3rem] text-center">
                              {player.rank === 1 ? '🏆' : `${player.rank}.`}
                            </div>
                            <div className="text-white font-medium">{player.name}</div>
                          </div>
                          <div className={`text-xl font-bold ${
                            player.score > 0 ? 'text-red-400' : player.score < 0 ? 'text-green-400' : 'text-gray-300'
                          }`}>
                            {player.score}
                          </div>
                        </div>
                      ))
                    ) : (
                      // Eski sistem (geriye dönük uyumluluk)
                      gameEndData.playerScores
                        .sort((a: any, b: any) => a.score - b.score) // En az puandan başla
                        .map((player: any, index: number) => (
                          <div key={index} className={`flex justify-between items-center p-4 rounded-xl border-2 ${
                            index === 0
                              ? 'border-green-500 bg-green-900/30' 
                              : 'border-gray-600 bg-gray-700'
                          }`}>
                            <div className="flex items-center space-x-3">
                              <div className="text-2xl min-w-[3rem] text-center">
                                {index === 0 ? '🏆' : `${index + 1}.`}
                              </div>
                              <div className="text-white font-medium">{player.name}</div>
                            </div>
                            <div className={`text-xl font-bold ${
                              player.score > 0 ? 'text-red-400' : player.score < 0 ? 'text-green-400' : 'text-gray-300'
                            }`}>
                              {player.score}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>

              {/* Butonlar */}
              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={startNewGame}
                  className="bg-green-600 hover:bg-green-500 text-white py-4 px-6 rounded-xl font-semibold text-lg transition-colors shadow-lg hover:shadow-xl"
                >
                  🎮 Yeni Oyun Başlat
                </button>
                
                <button
                  onClick={() => {
                    setShowGameEndModal(false);
                    // Oyun bittiğinde localStorage'ı temizle
                    localStorage.removeItem('roundDetails');
                  }}
                  className="bg-gray-600 hover:bg-gray-500 text-white py-3 px-6 rounded-xl font-medium transition-colors"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 