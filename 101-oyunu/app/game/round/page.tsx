'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface PlayerScore {
  points: number;
  penalty: number;
  hasOkey1: boolean;
  hasOkey2: boolean;
  finished: boolean; // Oyuncu bitirdiyse -101 puan
}

interface GameData {
  gameMode: 'group' | 'single';
  group1Name?: string;
  group2Name?: string;
  players: string[];
  currentRound: number;
}

export default function RoundPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [playerScores, setPlayerScores] = useState<PlayerScore[]>([]);
  const [inputValues, setInputValues] = useState<string[]>(['', '', '', '']);

  useEffect(() => {
    // URL parametrelerinden oyun verilerini al
    const mode = searchParams.get('mode') as 'group' | 'single';
    const group1 = searchParams.get('group1');
    const group2 = searchParams.get('group2');
    const round = parseInt(searchParams.get('round') || '1');
    const playerNames = [
      searchParams.get('player1'),
      searchParams.get('player2'),
      searchParams.get('player3'),
      searchParams.get('player4')
    ].filter(Boolean) as string[];

    if (mode && playerNames.length === 4) {
      const data: GameData = {
        gameMode: mode,
        players: playerNames,
        currentRound: round
      };
      
      if (mode === 'group') {
        data.group1Name = group1 || '1. Takım';
        data.group2Name = group2 || '2. Takım';
      }

      setGameData(data);
      setPlayerScores(Array(4).fill(null).map(() => ({
        points: 0,
        penalty: 0,
        hasOkey1: false,
        hasOkey2: false,
        finished: false
      })));
      setInputValues(['', '', '', '']); // Input alanlarını sıfırla
    }
  }, [searchParams]);

  const updatePlayerScore = (playerIndex: number, field: keyof PlayerScore, value: any) => {
    setPlayerScores(prev => prev.map((score, index) => 
      index === playerIndex ? { ...score, [field]: value } : score
    ));
  };

  const addPenalty = (playerIndex: number) => {
    setPlayerScores(prev => prev.map((score, index) => 
      index === playerIndex ? { ...score, penalty: score.penalty + 101 } : score
    ));
  };

  const removePenalty = (playerIndex: number) => {
    setPlayerScores(prev => prev.map((score, index) => 
      index === playerIndex ? { ...score, penalty: Math.max(0, score.penalty - 101) } : score
    ));
  };

  const toggleOkey = (playerIndex: number, okeyNumber: 1 | 2) => {
    const okeyField = okeyNumber === 1 ? 'hasOkey1' : 'hasOkey2';
    
    setPlayerScores(prev => prev.map((score, index) => {
      if (index === playerIndex) {
        return { ...score, [okeyField]: !score[okeyField] };
      }
      // Diğer oyunculardan bu okey'i kaldır (sadece bir oyuncuda olabilir)
      else {
        return { ...score, [okeyField]: false };
      }
    }));
  };

  const toggleFinished = (playerIndex: number) => {
    setPlayerScores(prev => {
      const newScores = prev.map((score, index) => {
        if (index === playerIndex) {
          const newFinished = !score.finished;
          
          // Eğer grup modundaysa ve oyuncu bitirildiyse, takım arkadaşının puanını 0 yap
          if (gameData?.gameMode === 'group' && newFinished) {
            const teammateIndex = getTeammateIndex(playerIndex);
            if (teammateIndex !== -1) {
              // Takım arkadaşının puanını 0 yap (penalty hariç)
              const updatedScores = [...prev];
              updatedScores[teammateIndex] = { ...updatedScores[teammateIndex], points: 0 };
              
              // Takım arkadaşının input değerini de sıfırla
              const newInputValues = [...inputValues];
              newInputValues[teammateIndex] = '';
              setInputValues(newInputValues);
              
              return { ...score, finished: newFinished };
            }
          }
          
          return { ...score, finished: newFinished };
        }
        // Eğer başka bir oyuncu seçiliyorsa, diğerlerinin finished durumunu false yap (sadece 1 kişi bitebilir)
        else if (prev[playerIndex].finished !== true) {
          return { ...score, finished: false };
        }
        return score;
      });
      
      // Grup modunda takım arkadaşının puanını sıfırla
      if (gameData?.gameMode === 'group' && !prev[playerIndex].finished) {
        const teammateIndex = getTeammateIndex(playerIndex);
        if (teammateIndex !== -1) {
          newScores[teammateIndex] = { ...newScores[teammateIndex], points: 0 };
          
          // Takım arkadaşının input değerini de sıfırla
          const newInputValues = [...inputValues];
          newInputValues[teammateIndex] = '';
          setInputValues(newInputValues);
        }
      }
      
      return newScores;
    });
  };

  const getTeammateIndex = (playerIndex: number) => {
    if (!gameData || gameData.gameMode !== 'group') return -1;
    
    // Takım eşleşmeleri: 0-2 (1. takım), 1-3 (2. takım)
    if (playerIndex === 0) return 2;
    if (playerIndex === 1) return 3;
    if (playerIndex === 2) return 0;
    if (playerIndex === 3) return 1;
    return -1;
  };

  const isPointInputDisabled = (playerIndex: number) => {
    if (!gameData || gameData.gameMode !== 'group') return false;
    
    // Takım arkadaşının bitirip bitirmediğini kontrol et
    const teammateIndex = getTeammateIndex(playerIndex);
    if (teammateIndex !== -1) {
      return playerScores[teammateIndex]?.finished || false;
    }
    
    return false;
  };

  const getTotal = (playerIndex: number) => {
    const score = playerScores[playerIndex];
    if (!score) return 0;
    
    let total = score.points + score.penalty;
    
    // Oyuncu bitirdiyse -101 puan
    if (score.finished) {
      total -= 101;
    }
    
    return total;
  };

  const handleSubmit = () => {
    if (!gameData) return;

    // Tüm puanları hesapla
    const roundScores = playerScores.map((_, index) => getTotal(index));
    
    // Round detaylarını localStorage'e kaydet
    const roundDetails = {
      round: gameData.currentRound,
      players: gameData.players.map((name, index) => ({
        name,
        points: playerScores[index].points,
        penalty: playerScores[index].penalty,
        hasOkey1: playerScores[index].hasOkey1,
        hasOkey2: playerScores[index].hasOkey2,
        finished: playerScores[index].finished,
        total: getTotal(index)
      }))
    };
    
    // Mevcut detayları al ve yeni round'u ekle
    const existingDetails = JSON.parse(localStorage.getItem('roundDetails') || '[]');
    existingDetails.push(roundDetails);
    localStorage.setItem('roundDetails', JSON.stringify(existingDetails));

    // Game sayfasına geri dön ve puanları aktar
    const params = new URLSearchParams({
      mode: gameData.gameMode,
      player1: gameData.players[0],
      player2: gameData.players[1],
      player3: gameData.players[2],
      player4: gameData.players[3],
      scores: roundScores.join(','),
      round: gameData.currentRound.toString()
    });

    if (gameData.gameMode === 'group') {
      params.append('group1', gameData.group1Name!);
      params.append('group2', gameData.group2Name!);
    }

    router.push(`/game?${params.toString()}`);
  };

  if (!gameData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-gray-300 text-xl">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.back()}
            className="bg-gray-700 hover:bg-gray-600 text-white p-3 rounded-xl transition-colors flex items-center space-x-2 shadow-lg"
            title="Geri Dön"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="font-medium">Geri</span>
          </button>
          
          <div className="text-center flex-1">
            <h1 className="text-3xl font-bold text-white mb-2">
              Round {gameData.currentRound}
            </h1>
            <p className="text-gray-300">Puan girişi yapın</p>
          </div>
          
          {/* Sağ taraf boş - dengeleme için */}
          <div className="w-20"></div>
        </div>

        {/* Score Table - Responsive */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden mb-6">
          {/* Header - Hidden on mobile, shown on desktop */}
          <div className="bg-gray-700 px-4 py-4 hidden md:block">
            <div className="grid grid-cols-5 gap-4 text-center">
              <div className="text-gray-200 font-semibold text-sm">Oyuncu</div>
              <div className="text-gray-200 font-semibold text-sm">Puan</div>
              <div className="text-gray-200 font-semibold text-sm">Ceza</div>
              <div className="text-gray-200 font-semibold text-sm">Okey</div>
              <div className="text-gray-200 font-semibold text-sm">Toplam</div>
            </div>
          </div>

                     {/* Mobile Header */}
           <div className="bg-gray-700 px-2 py-3 md:hidden">
             <div className="grid grid-cols-4 gap-1 text-center">
               {gameData.players.map((playerName, index) => (
                 <div key={index} className="text-gray-200 font-semibold text-xs">
                   <div className="truncate">{playerName}</div>
                   {gameData.gameMode === 'group' && (
                     <div className="text-xs text-gray-400 mt-1">
                       {index === 0 || index === 2 ? gameData.group1Name : gameData.group2Name}
                     </div>
                   )}
                 </div>
               ))}
             </div>
           </div>

          {/* Content */}
          <div className="p-4">
            {/* Mobile Layout - All players side by side */}
            <div className="md:hidden space-y-6">
              {/* Player Names Row - Already in header */}
              
              {/* Points Input Row */}
              <div>
                <div className="text-sm font-medium text-gray-300 mb-2">Puan</div>
                <div className="grid grid-cols-4 gap-2">
                                     {gameData.players.map((_, playerIndex) => {
                     const isDisabled = isPointInputDisabled(playerIndex);
                     return (
                       <input
                         key={playerIndex}
                         type="number"
                         value={isDisabled ? '0' : inputValues[playerIndex]}
                         disabled={isDisabled}
                         onChange={(e) => {
                           if (isDisabled) return;
                           
                           const value = e.target.value;
                           
                           // Input değerini her zaman güncelle (görsel için)
                           const newInputValues = [...inputValues];
                           newInputValues[playerIndex] = value;
                           setInputValues(newInputValues);
                           
                           // Sayısal değeri hesapla ve kaydet
                           if (value === '' || value === '-') {
                             updatePlayerScore(playerIndex, 'points', 0);
                           } else {
                             const numValue = parseInt(value);
                             if (!isNaN(numValue)) {
                               updatePlayerScore(playerIndex, 'points', numValue);
                             }
                           }
                         }}
                         className={`w-full px-2 py-3 border rounded-lg text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-sm ${
                           isDisabled 
                             ? 'bg-gray-600 border-gray-500 text-gray-400 cursor-not-allowed' 
                             : 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                         }`}
                         placeholder={isDisabled ? "Takım arkadaşı bitirdi" : "0"}
                         min="-999"
                         max="999"
                       />
                     );
                   })}
                </div>
              </div>

              {/* Penalty Row */}
              <div>
                <div className="text-sm font-medium text-gray-300 mb-2">Ceza</div>
                <div className="grid grid-cols-4 gap-2">
                  {gameData.players.map((_, playerIndex) => (
                    <div key={playerIndex} className="flex items-center justify-center space-x-1">
                      <button
                        onClick={() => removePenalty(playerIndex)}
                        disabled={playerScores[playerIndex]?.penalty === 0}
                        className="w-8 h-8 rounded-full bg-red-700 text-red-200 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-sm font-bold"
                      >
                        −
                      </button>
                      <div className="bg-gray-700 border border-gray-600 rounded px-2 py-1 min-w-[40px] text-center">
                        <span className="text-white font-medium text-sm">
                          {playerScores[playerIndex]?.penalty || 0}
                        </span>
                      </div>
                      <button
                        onClick={() => addPenalty(playerIndex)}
                        className="w-8 h-8 rounded-full bg-red-700 text-red-200 hover:bg-red-600 transition-colors flex items-center justify-center text-sm font-bold"
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Okey Row */}
              <div>
                <div className="text-sm font-medium text-gray-300 mb-2">Okey</div>
                <div className="grid grid-cols-4 gap-2">
                  {gameData.players.map((_, playerIndex) => (
                    <div key={playerIndex} className="flex justify-center space-x-1">
                      <button
                        onClick={() => toggleOkey(playerIndex, 1)}
                        className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${
                          playerScores[playerIndex]?.hasOkey1
                            ? 'bg-amber-600 text-white shadow-lg'
                            : 'bg-amber-900/30 border border-amber-700 text-amber-300 hover:bg-amber-800/50'
                        }`}
                      >
                        1
                      </button>
                      <button
                        onClick={() => toggleOkey(playerIndex, 2)}
                        className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${
                          playerScores[playerIndex]?.hasOkey2
                            ? 'bg-amber-600 text-white shadow-lg'
                            : 'bg-amber-900/30 border border-amber-700 text-amber-300 hover:bg-amber-800/50'
                        }`}
                      >
                        2
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Row */}
              <div>
                <div className="text-sm font-medium text-gray-300 mb-2">Toplam</div>
                <div className="grid grid-cols-4 gap-2">
                  {gameData.players.map((_, playerIndex) => (
                    <div key={playerIndex} className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-blue-700 rounded-lg px-2 py-2 text-center">
                      <span className="text-lg font-bold text-white">
                        {getTotal(playerIndex)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Desktop Layout - Table format */}
            <div className="hidden md:block space-y-4">
              {gameData.players.map((playerName, playerIndex) => (
                <div key={playerIndex} className="grid grid-cols-5 gap-4 items-center py-3 border-b border-gray-700 last:border-b-0">
                  {/* Player Name */}
                  <div className="text-white font-medium">
                    {playerName}
                    {gameData.gameMode === 'group' && (
                      <div className="text-xs text-gray-400 mt-1">
                        {playerIndex === 0 || playerIndex === 2 ? gameData.group1Name : gameData.group2Name}
                      </div>
                    )}
                  </div>

                  {/* Points Input */}
                  <div>
                    {(() => {
                      const isDisabled = isPointInputDisabled(playerIndex);
                      return (
                        <input
                          type="number"
                          value={isDisabled ? '0' : inputValues[playerIndex]}
                          disabled={isDisabled}
                          onChange={(e) => {
                            if (isDisabled) return;
                            
                            const value = e.target.value;
                            
                            // Input değerini her zaman güncelle (görsel için)
                            const newInputValues = [...inputValues];
                            newInputValues[playerIndex] = value;
                            setInputValues(newInputValues);
                            
                            // Sayısal değeri hesapla ve kaydet
                            if (value === '' || value === '-') {
                              updatePlayerScore(playerIndex, 'points', 0);
                            } else {
                              const numValue = parseInt(value);
                              if (!isNaN(numValue)) {
                                updatePlayerScore(playerIndex, 'points', numValue);
                              }
                            }
                          }}
                          className={`w-full px-3 py-2 border rounded-lg text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors ${
                            isDisabled 
                              ? 'bg-gray-600 border-gray-500 text-gray-400 cursor-not-allowed' 
                              : 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                          }`}
                          placeholder={isDisabled ? "Takım arkadaşı bitirdi" : "0"}
                          min="-999"
                          max="999"
                        />
                      );
                    })()}
                  </div>

                  {/* Penalty */}
                  <div className="flex items-center justify-center space-x-3">
                    <button
                      onClick={() => removePenalty(playerIndex)}
                      disabled={playerScores[playerIndex]?.penalty === 0}
                      className="w-9 h-9 rounded-full bg-red-700 text-red-200 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-sm font-bold"
                    >
                      −
                    </button>
                    <span className="text-white font-medium min-w-[50px] text-center bg-gray-700 border border-gray-600 rounded-lg px-2 py-1">
                      {playerScores[playerIndex]?.penalty || 0}
                    </span>
                    <button
                      onClick={() => addPenalty(playerIndex)}
                      className="w-9 h-9 rounded-full bg-red-700 text-red-200 hover:bg-red-600 transition-colors flex items-center justify-center text-sm font-bold"
                    >
                      +
                    </button>
                  </div>

                  {/* Okey Buttons */}
                  <div className="flex justify-center space-x-2">
                    <button
                      onClick={() => toggleOkey(playerIndex, 1)}
                      className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${
                        playerScores[playerIndex]?.hasOkey1
                          ? 'bg-amber-600 text-white shadow-lg'
                          : 'bg-amber-900/30 border border-amber-700 text-amber-300 hover:bg-amber-800/50'
                      }`}
                    >
                      1
                    </button>
                    <button
                      onClick={() => toggleOkey(playerIndex, 2)}
                      className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${
                        playerScores[playerIndex]?.hasOkey2
                          ? 'bg-amber-600 text-white shadow-lg'
                          : 'bg-amber-900/30 border border-amber-700 text-amber-300 hover:bg-amber-800/50'
                      }`}
                    >
                      2
                    </button>
                  </div>

                  {/* Total */}
                  <div className="text-center">
                    <div className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white font-semibold">
                      {getTotal(playerIndex)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Oyuncu Bitirme Seçimi */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">Oyunu Bitiren (-101 puan)</h3>
          <p className="text-sm text-gray-400 mb-4">Sadece 1 oyuncu seçilebilir</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {gameData.players.map((playerName, playerIndex) => (
              <button
                key={playerIndex}
                onClick={() => toggleFinished(playerIndex)}
                className={`py-4 px-4 rounded-xl text-base font-medium transition-all duration-200 flex items-center justify-between ${
                  playerScores[playerIndex]?.finished
                    ? 'bg-green-600 text-white shadow-lg border-2 border-green-400'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                }`}
              >
                <span>{playerName}</span>
                <span className="text-2xl">
                  {playerScores[playerIndex]?.finished ? '✅' : '⭕'}
                </span>
              </button>
            ))}
          </div>
          
          <div className="mt-4 space-y-3">
            <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
              <p className="text-sm text-yellow-300 flex items-center">
                <span className="text-lg mr-2">⚠️</span>
                Sadece 1 oyuncu bitebilir. Yeni seçim yaparsanız önceki iptal olur.
              </p>
            </div>
            
            {gameData.gameMode === 'group' && (
              <div className="p-3 bg-blue-900/30 border border-blue-800 rounded-lg">
                <p className="text-sm text-blue-300 flex items-center">
                  <span className="text-lg mr-2">💡</span>
                  Takım oyununda: Bir oyuncu bitirdiğinde takım arkadaşının puanı otomatik 0 olur ve puan girişi engellenir (cezalar etkilenmez)
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 px-6 rounded-xl font-semibold text-lg transition-colors shadow-lg hover:shadow-xl"
        >
          Round'u Kaydet
        </button>
      </div>
    </div>
  );
} 