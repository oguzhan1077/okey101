'use client';

import { useState, useEffect, Suspense, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// Next.js 15 için dynamic rendering'e zorla
export const dynamic = 'force-dynamic';

interface PlayerScore {
  points: number;
  penalty: number; // Backward compatibility - toplam ceza
  individualPenalty: number; // Bireysel ceza
  teamPenalty: number; // Takım cezası
  hasOkey1: boolean;
  hasOkey2: boolean;
  finished: boolean; // Oyuncu bitirdiyse -101 puan
  handFinished: boolean; // Elden bitirdiyse -202 puan
}

interface GameData {
  gameMode: 'group' | 'single';
  group1Name?: string;
  group2Name?: string;
  players: string[];
  currentRound: number;
  dealerIndex: number; // Dağıtan oyuncunun indexi
}

function RoundPageContent() {
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
    const dealerParam = searchParams.get('dealer');
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
        currentRound: round,
        dealerIndex: dealerParam ? parseInt(dealerParam) : 0,
      };
      
      if (mode === 'group') {
        data.group1Name = group1 || '1. Takım';
        data.group2Name = group2 || '2. Takım';
      }

      setGameData(data);
      setPlayerScores([
        { points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0, hasOkey1: false, hasOkey2: false, finished: false, handFinished: false },
        { points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0, hasOkey1: false, hasOkey2: false, finished: false, handFinished: false },
        { points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0, hasOkey1: false, hasOkey2: false, finished: false, handFinished: false },
        { points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0, hasOkey1: false, hasOkey2: false, finished: false, handFinished: false }
      ]);
      setInputValues(['', '', '', '']); // Input alanlarını sıfırla
    }
  }, [searchParams]);

  const updatePlayerScore = useCallback((playerIndex: number, field: keyof PlayerScore, value: any) => {
    setPlayerScores(prev => prev.map((score, index) => 
      index === playerIndex ? { ...score, [field]: value } : score
    ));
  }, []);

  const addPenalty = useCallback((playerIndex: number, type: 'individual' | 'team') => {
    setPlayerScores(prev => prev.map((score, index) => {
      if (index === playerIndex) {
        const newScore = { ...score };
        if (type === 'individual') {
          newScore.individualPenalty = score.individualPenalty + 101;
        } else {
          newScore.teamPenalty = score.teamPenalty + 101;
        }
        newScore.penalty = newScore.individualPenalty + newScore.teamPenalty;
        return newScore;
      }
      return score;
    }));
  }, []);

  const removePenalty = useCallback((playerIndex: number, type: 'individual' | 'team') => {
    setPlayerScores(prev => prev.map((score, index) => {
      if (index === playerIndex) {
        const newScore = { ...score };
        if (type === 'individual') {
          newScore.individualPenalty = Math.max(0, score.individualPenalty - 101);
        } else {
          newScore.teamPenalty = Math.max(0, score.teamPenalty - 101);
        }
        newScore.penalty = newScore.individualPenalty + newScore.teamPenalty;
        return newScore;
      }
      return score;
    }));
  }, []);

  const toggleOkey = useCallback((playerIndex: number, okeyNumber: 1 | 2) => {
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
  }, []);

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
              
              return { ...score, finished: newFinished, handFinished: false };
            }
          }
          
          return { ...score, finished: newFinished, handFinished: false };
        }
        // Eğer başka bir oyuncu seçiliyorsa, diğerlerinin finished durumunu false yap (sadece 1 kişi bitebilir)
        else if (prev[playerIndex].finished !== true) {
          return { ...score, finished: false, handFinished: false };
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

  const toggleHandFinished = (playerIndex: number) => {
    if (!gameData) return;
    
    setPlayerScores(prev => {
      const newHandFinished = !prev[playerIndex].handFinished;
      
      const newScores = prev.map((score, index) => {
        // Tüm oyuncuların hand finished durumunu false yap
        const resetScore = { ...score, handFinished: false, finished: false };
        
        if (newHandFinished) {
          if (gameData.gameMode === 'group') {
            // GRUP MODU: Mevcut mantık
            const teammateIndex = getTeammateIndex(playerIndex);
            
            if (index === playerIndex) {
              // Elden biten oyuncuya -202 puan
              return { ...resetScore, points: -202, handFinished: true, finished: true };
            } else if (index === teammateIndex) {
              // Eşine 0 puan
              return { ...resetScore, points: 0 };
            } else {
              // Karşı takımın her oyuncusuna 202 puan + 202 bireysel ceza
              return { ...resetScore, points: 202, individualPenalty: 202, penalty: 202 };
            }
          } else {
            // BİREYSEL MODU: Yeni mantık
            if (index === playerIndex) {
              // Elden biten oyuncuya -202 puan
              return { ...resetScore, points: -202, handFinished: true, finished: true };
            } else {
              // Diğer tüm oyunculara 202 puan + 202 bireysel ceza
              return { ...resetScore, points: 202, individualPenalty: 202, penalty: 202 };
            }
          }
        }
        
        return resetScore;
      });
      
      // Input değerlerini güncelle
      if (newHandFinished) {
        const newInputValues = ['', '', '', ''];
        
        if (gameData.gameMode === 'group') {
          // GRUP MODU
          const teammateIndex = getTeammateIndex(playerIndex);
          
          newInputValues[playerIndex] = '-202';
          if (teammateIndex !== -1) {
            newInputValues[teammateIndex] = '0';
          }
          
          // Karşı takım oyuncularının input değerleri
          [0, 1, 2, 3].forEach(i => {
            if (i !== playerIndex && i !== teammateIndex) {
              newInputValues[i] = '202';
            }
          });
        } else {
          // BİREYSEL MODU
          newInputValues[playerIndex] = '-202';
          [0, 1, 2, 3].forEach(i => {
            if (i !== playerIndex) {
              newInputValues[i] = '202';
            }
          });
        }
        
        setInputValues(newInputValues);
      } else {
        setInputValues(['', '', '', '']);
      }
      
      return newScores;
    });
  };

  const getTeammateIndex = useCallback((playerIndex: number) => {
    if (!gameData || gameData.gameMode !== 'group') return -1;
    
    // Takım eşleşmeleri: 0-2 (1. takım), 1-3 (2. takım)
    if (playerIndex === 0) return 2;
    if (playerIndex === 1) return 3;
    if (playerIndex === 2) return 0;
    if (playerIndex === 3) return 1;
    return -1;
  }, [gameData?.gameMode]);

  const isPointInputDisabled = useCallback((playerIndex: number) => {
    if (!gameData || gameData.gameMode !== 'group') return false;
    
    // Takım arkadaşının bitirip bitirmediğini kontrol et
    const teammateIndex = getTeammateIndex(playerIndex);
    if (teammateIndex !== -1) {
      return playerScores[teammateIndex]?.finished || false;
    }
    
    return false;
  }, [gameData?.gameMode, getTeammateIndex, playerScores]);

  const getTotal = useCallback((playerIndex: number) => {
    const score = playerScores[playerIndex];
    if (!score) return 0;
    
    let total = score.points + score.penalty;
    
    // Elden bitirdiyse zaten -202 puan olarak hesaplandı
    if (score.handFinished) {
      return total;
    }
    
    // Normal bitirmede -101 puan
    if (score.finished && !score.handFinished) {
      total -= 101;
    }
    
    return total;
  }, [playerScores]);

  const handleSubmit = useCallback(() => {
    if (!gameData) return;

    // Tüm puanları hesapla
    const roundScores = playerScores.map((_, index) => getTotal(index));
    
    // Dealer'ı bir sonraki oyuncuya geçir
    const nextDealer = (gameData.dealerIndex + 1) % gameData.players.length;
    
    // Round detaylarını localStorage'e kaydet
    const roundDetails = {
      round: gameData.currentRound,
      mode: gameData.gameMode,
      group1: gameData.group1Name,
      group2: gameData.group2Name,
      player1: gameData.players[0],
      player2: gameData.players[1],
      player3: gameData.players[2],
      player4: gameData.players[3],
      players: gameData.players.map((name, index) => ({
        name,
        points: playerScores[index].points,
        penalty: playerScores[index].penalty,
        individualPenalty: playerScores[index].individualPenalty,
        teamPenalty: playerScores[index].teamPenalty,
        hasOkey1: playerScores[index].hasOkey1,
        hasOkey2: playerScores[index].hasOkey2,
        finished: playerScores[index].finished,
        handFinished: playerScores[index].handFinished,
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
      round: gameData.currentRound.toString(),
      dealer: nextDealer.toString(), // Yeni dealer'ı ekle
    });

    if (gameData.gameMode === 'group') {
      params.append('group1', gameData.group1Name!);
      params.append('group2', gameData.group2Name!);
    }

    router.push(`/game?${params.toString()}`);
  }, [gameData, playerScores, getTotal, router]);

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
              <div className="text-gray-200 font-semibold text-sm">
                <div>Ceza</div>
                <div className="text-xs font-normal text-gray-400 mt-1">
                  <span className="text-orange-300">Bireysel</span>
                  {gameData.gameMode === 'group' && (
                    <span className="text-red-300 ml-2">Takım</span>
                  )}
                </div>
              </div>
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
                         type="text"
                         inputMode="decimal"
                         pattern="^-?\d*$"
                         value={isDisabled ? '0' : inputValues[playerIndex]}
                         disabled={isDisabled}
                         onChange={(e) => {
                           if (isDisabled) return;
                           
                           let value = e.target.value;
                           
                           // Sadece sayı ve minus işareti kabul et
                           if (!/^-?\d*$/.test(value)) {
                             return; // Geçersiz karakterleri reddet
                           }
                           
                           // Birden fazla minus işareti kontrolü
                           if (value.split('-').length > 2) {
                             return;
                           }
                           
                           // Minus işareti sadece başta olabilir
                           if (value.includes('-') && value.indexOf('-') !== 0) {
                             return;
                           }
                           
                           // Input değerini her zaman güncelle (görsel için)
                           const newInputValues = [...inputValues];
                           newInputValues[playerIndex] = value;
                           setInputValues(newInputValues);
                           
                           // Sayısal değeri hesapla ve kaydet
                           if (value === '' || value === '-') {
                             updatePlayerScore(playerIndex, 'points', 0);
                           } else {
                             const numValue = parseInt(value);
                             if (!isNaN(numValue) && numValue >= -999 && numValue <= 999) {
                               updatePlayerScore(playerIndex, 'points', numValue);
                             }
                           }
                         }}
                         className={`w-full px-2 py-3 border rounded-lg text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-base ${
                           isDisabled 
                             ? 'bg-gray-600 border-gray-500 text-gray-400 cursor-not-allowed' 
                             : 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                         }`}
                         placeholder={isDisabled ? "Takım arkadaşı bitirdi" : "0"}
                         maxLength={4}
                       />
                     );
                   })}
                </div>
              </div>

              {/* Penalty Row */}
              <div>
                <div className="text-sm font-medium text-gray-300 mb-2">Ceza</div>
                
                {/* Bireysel Ceza */}
                <div className="mb-3">
                  <div className="text-xs text-orange-300 text-center mb-1">Bireysel</div>
                  <div className="grid grid-cols-4 gap-2">
                    {gameData.players.map((_, playerIndex) => (
                      <div key={playerIndex} className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => removePenalty(playerIndex, 'individual')}
                          disabled={playerScores[playerIndex]?.individualPenalty === 0}
                          className="w-6 h-6 rounded-full bg-orange-700 text-orange-200 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-xs font-bold touch-manipulation"
                          title="Bireysel ceza çıkar"
                        >
                          −
                        </button>
                        <div className="bg-gray-700 border border-gray-600 rounded px-1 py-0.5 min-w-[30px] text-center">
                          <span className="text-white font-medium text-xs">
                            {playerScores[playerIndex]?.individualPenalty || 0}
                          </span>
                        </div>
                        <button
                          onClick={() => addPenalty(playerIndex, 'individual')}
                          className="w-6 h-6 rounded-full bg-orange-700 text-orange-200 hover:bg-orange-600 transition-colors flex items-center justify-center text-xs font-bold touch-manipulation"
                          title="Bireysel ceza ekle"
                        >
                          +
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Takım Cezası - Sadece grup modunda */}
                {gameData.gameMode === 'group' && (
                  <div>
                    <div className="text-xs text-red-300 text-center mb-1">Takım</div>
                    <div className="grid grid-cols-4 gap-2">
                      {gameData.players.map((_, playerIndex) => (
                        <div key={playerIndex} className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => removePenalty(playerIndex, 'team')}
                            disabled={playerScores[playerIndex]?.teamPenalty === 0}
                            className="w-6 h-6 rounded-full bg-red-700 text-red-200 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-xs font-bold touch-manipulation"
                            title="Takım cezası çıkar"
                          >
                            −
                          </button>
                          <div className="bg-gray-700 border border-gray-600 rounded px-1 py-0.5 min-w-[30px] text-center">
                            <span className="text-white font-medium text-xs">
                              {playerScores[playerIndex]?.teamPenalty || 0}
                            </span>
                          </div>
                          <button
                            onClick={() => addPenalty(playerIndex, 'team')}
                            className="w-6 h-6 rounded-full bg-red-700 text-red-200 hover:bg-red-600 transition-colors flex items-center justify-center text-xs font-bold touch-manipulation"
                            title="Takım cezası ekle"
                          >
                            +
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Okey Row */}
              <div>
                <div className="text-sm font-medium text-gray-300 mb-2">Okey</div>
                <div className="grid grid-cols-4 gap-2">
                  {gameData.players.map((_, playerIndex) => (
                    <div key={playerIndex} className="flex justify-center space-x-1">
                      <button
                        onClick={() => toggleOkey(playerIndex, 1)}
                        className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors touch-manipulation ${
                          playerScores[playerIndex]?.hasOkey1
                            ? 'bg-amber-600 text-white shadow-lg'
                            : 'bg-amber-900/30 border border-amber-700 text-amber-300 hover:bg-amber-800/50'
                        }`}
                        title="İlk Okey"
                      >
                        ⚪
                      </button>
                      <button
                        onClick={() => toggleOkey(playerIndex, 2)}
                        className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors touch-manipulation ${
                          playerScores[playerIndex]?.hasOkey2
                            ? 'bg-amber-600 text-white shadow-lg'
                            : 'bg-amber-900/30 border border-amber-700 text-amber-300 hover:bg-amber-800/50'
                        }`}
                        title="İkinci Okey"
                      >
                        ⚪
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
                          type="text"
                          inputMode="decimal"
                          pattern="^-?\d*$"
                          value={isDisabled ? '0' : inputValues[playerIndex]}
                          disabled={isDisabled}
                          onChange={(e) => {
                            if (isDisabled) return;
                            
                            let value = e.target.value;
                            
                            // Sadece sayı ve minus işareti kabul et
                            if (!/^-?\d*$/.test(value)) {
                              return; // Geçersiz karakterleri reddet
                            }
                            
                            // Birden fazla minus işareti kontrolü
                            if (value.split('-').length > 2) {
                              return;
                            }
                            
                            // Minus işareti sadece başta olabilir
                            if (value.includes('-') && value.indexOf('-') !== 0) {
                              return;
                            }
                            
                            // Input değerini her zaman güncelle (görsel için)
                            const newInputValues = [...inputValues];
                            newInputValues[playerIndex] = value;
                            setInputValues(newInputValues);
                            
                            // Sayısal değeri hesapla ve kaydet
                            if (value === '' || value === '-') {
                              updatePlayerScore(playerIndex, 'points', 0);
                            } else {
                              const numValue = parseInt(value);
                              if (!isNaN(numValue) && numValue >= -999 && numValue <= 999) {
                                updatePlayerScore(playerIndex, 'points', numValue);
                              }
                            }
                          }}
                          className={`w-full px-3 py-2 border rounded-lg text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-base ${
                            isDisabled 
                              ? 'bg-gray-600 border-gray-500 text-gray-400 cursor-not-allowed' 
                              : 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                          }`}
                          placeholder={isDisabled ? "Takım arkadaşı bitirdi" : "0"}
                          maxLength={4}
                        />
                      );
                    })()}
                  </div>

                  {/* Penalty */}
                  <div className="flex items-center justify-center space-x-2">
                    <div className="space-y-2">
                      {/* Bireysel Ceza */}
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => removePenalty(playerIndex, 'individual')}
                          disabled={playerScores[playerIndex]?.individualPenalty === 0}
                          className="w-7 h-7 rounded-full bg-orange-700 text-orange-200 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-xs font-bold touch-manipulation"
                          title="Bireysel ceza çıkar"
                        >
                          −
                        </button>
                        <span className="text-white font-medium min-w-[40px] text-center bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-xs">
                          {playerScores[playerIndex]?.individualPenalty || 0}
                        </span>
                        <button
                          onClick={() => addPenalty(playerIndex, 'individual')}
                          className="w-7 h-7 rounded-full bg-orange-700 text-orange-200 hover:bg-orange-600 transition-colors flex items-center justify-center text-xs font-bold touch-manipulation"
                          title="Bireysel ceza ekle"
                        >
                          +
                        </button>
                      </div>
                      
                      {/* Takım Cezası - Sadece grup modunda */}
                      {gameData.gameMode === 'group' && (
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => removePenalty(playerIndex, 'team')}
                            disabled={playerScores[playerIndex]?.teamPenalty === 0}
                            className="w-7 h-7 rounded-full bg-red-700 text-red-200 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-xs font-bold touch-manipulation"
                            title="Takım cezası çıkar"
                          >
                            −
                          </button>
                          <span className="text-white font-medium min-w-[40px] text-center bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-xs">
                            {playerScores[playerIndex]?.teamPenalty || 0}
                          </span>
                          <button
                            onClick={() => addPenalty(playerIndex, 'team')}
                            className="w-7 h-7 rounded-full bg-red-700 text-red-200 hover:bg-red-600 transition-colors flex items-center justify-center text-xs font-bold touch-manipulation"
                            title="Takım cezası ekle"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Okey Buttons */}
                  <div className="flex justify-center space-x-2">
                    <button
                      onClick={() => toggleOkey(playerIndex, 1)}
                      className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors touch-manipulation ${
                        playerScores[playerIndex]?.hasOkey1
                          ? 'bg-amber-600 text-white shadow-lg'
                          : 'bg-amber-900/30 border border-amber-700 text-amber-300 hover:bg-amber-800/50'
                      }`}
                      title="İlk Okey"
                    >
                      ⚪
                    </button>
                    <button
                      onClick={() => toggleOkey(playerIndex, 2)}
                      className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors touch-manipulation ${
                        playerScores[playerIndex]?.hasOkey2
                          ? 'bg-amber-600 text-white shadow-lg'
                          : 'bg-amber-900/30 border border-amber-700 text-amber-300 hover:bg-amber-800/50'
                      }`}
                      title="İkinci Okey"
                    >
                      ⚪
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
                disabled={playerScores.some(score => score.handFinished)}
                className={`py-4 px-4 rounded-xl text-base font-medium transition-all duration-200 flex items-center justify-between touch-manipulation ${
                  playerScores[playerIndex]?.finished && !playerScores[playerIndex]?.handFinished
                    ? 'bg-green-600 text-white shadow-lg border-2 border-green-400'
                    : playerScores.some(score => score.handFinished)
                    ? 'bg-gray-600 text-gray-500 cursor-not-allowed border border-gray-500'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                }`}
              >
                <span>{playerName}</span>
                <span className="text-2xl">
                  {playerScores[playerIndex]?.finished && !playerScores[playerIndex]?.handFinished ? '✅' : '⭕'}
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

        {/* Elden Bitirme Seçimi */}
        <div className="bg-purple-800 border border-purple-700 rounded-2xl shadow-2xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">Elden Bitiren (-202 puan)</h3>
          <p className="text-sm text-purple-300 mb-4">
            {gameData.gameMode === 'group' 
              ? 'Takım oyununda: Karşı takıma toplam 404 puan (202 puan + 202 bireysel ceza)' 
              : 'Bireysel oyunda: Diğer oyunculara toplam 404 puan (202 puan + 202 bireysel ceza)'
            }
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {gameData.players.map((playerName, playerIndex) => (
              <button
                key={playerIndex}
                onClick={() => toggleHandFinished(playerIndex)}
                disabled={playerScores.some(score => score.finished && !score.handFinished)}
                className={`py-4 px-4 rounded-xl text-base font-medium transition-all duration-200 flex items-center justify-between touch-manipulation ${
                  playerScores[playerIndex]?.handFinished
                    ? 'bg-purple-600 text-white shadow-lg border-2 border-purple-400'
                    : playerScores.some(score => score.finished && !score.handFinished)
                    ? 'bg-gray-600 text-gray-500 cursor-not-allowed border border-gray-500'
                    : 'bg-purple-700 text-purple-200 hover:bg-purple-600 border border-purple-600'
                }`}
              >
                <span>{playerName}</span>
                <span className="text-2xl">
                  {playerScores[playerIndex]?.handFinished ? '🎯' : '⭕'}
                </span>
              </button>
            ))}
          </div>
          
          <div className="mt-4 space-y-3">
            <div className="p-3 bg-purple-900/30 border border-purple-700 rounded-lg">
              <p className="text-sm text-purple-300 flex items-center">
                <span className="text-lg mr-2">🎯</span>
                {gameData.gameMode === 'group' 
                  ? 'Elden bitiren: -202 puan, eş: 0 puan, karşı takım: her oyuncuya toplam 404 puan (202 puan + 202 bireysel ceza)'
                  : 'Elden bitiren: -202 puan, diğer oyuncular: her birine toplam 404 puan (202 puan + 202 bireysel ceza)'
                }
              </p>
            </div>
            
            <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
              <p className="text-sm text-red-300 flex items-center">
                <span className="text-lg mr-2">⚠️</span>
                Bu seçenek tüm puanları otomatik hesaplar. Manual puan girişi devre dışı kalır.
              </p>
            </div>
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

export default function RoundPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-gray-300 text-xl">Yükleniyor...</div>
      </div>
    }>
      <RoundPageContent />
    </Suspense>
  );
} 