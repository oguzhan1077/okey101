'use client';

import { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useVenue } from '@/context/VenueContext';

// Next.js 15 için dynamic rendering'e zorla
export const dynamic = 'force-dynamic';

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
    individualPenalty: number;
    teamPenalty: number;
    hasOkey1: boolean;
    hasOkey2: boolean;
    finished: boolean;
    handFinished: boolean;
    total: number;
  }[];
}

interface GameData {
  gameMode: 'group' | 'single';
  group1Name?: string;
  group2Name?: string;
  players: string[];
  dealerIndex: number; // Dağıtan oyuncunun indexi
}

function GamePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { venue } = useVenue();
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
  const [editInputValues, setEditInputValues] = useState<{points: string[], penalty: string[]}>({
    points: ['', '', '', ''],
    penalty: ['', '', '', '']
  });
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'finish' | 'newGame' | null>(null);

  useEffect(() => {
    // URL parametrelerinden oyun verilerini al
    const mode = searchParams.get('mode') as 'group' | 'single';
    const group1 = searchParams.get('group1');
    const group2 = searchParams.get('group2');
    const scores = searchParams.get('scores');
    const round = searchParams.get('round');
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
        dealerIndex: dealerParam ? parseInt(dealerParam) : 0,
      };
      
      if (mode === 'group') {
        data.group1Name = group1 || '1. Takım';
        data.group2Name = group2 || '2. Takım';
      }

      setGameData(data);
      
      // localStorage'dan round detaylarını yükle (sadece bir kez)
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

  const goToRoundPage = useCallback(() => {
    if (!gameData) return;
    setShowCalculation(false); // Yeni round'a giderken hesaplamayı kapat

    const params = new URLSearchParams({
      mode: gameData.gameMode,
      player1: gameData.players[0],
      player2: gameData.players[1],
      player3: gameData.players[2],
      player4: gameData.players[3],
      round: currentRound.toString(),
      dealer: gameData.dealerIndex.toString(), // Dealer bilgisini ekle
    });

    if (gameData.gameMode === 'group') {
      params.append('group1', gameData.group1Name!);
      params.append('group2', gameData.group2Name!);
    }

    router.push(`/game/round?${params.toString()}`);
  }, [gameData, currentRound, router]);

  const calculateTotals = useCallback(() => {
    setShowCalculation(true);
  }, []);

  const getTotalScore = useCallback((playerIndex: number) => {
    let baseScore = players[playerIndex]?.scores.reduce((sum, score) => sum + score, 0) || 0;
    
    // Takım cezalarını eşit şekilde dağıt
    if (gameData?.gameMode === 'group') {
      const teammateIndex = getTeammateIndex(playerIndex);
      
      roundDetails.forEach(round => {
        const player = round.players[playerIndex];
        const teammate = teammateIndex !== -1 ? round.players[teammateIndex] : null;
        
        if (player && teammate) {
          // Bu oyuncunun takım cezasının yarısını ekle
          const playerTeamPenalty = player.teamPenalty / 2;
          // Takım arkadaşının takım cezasının yarısını da ekle
          const teammateTeamPenalty = teammate.teamPenalty / 2;
          
          baseScore += playerTeamPenalty + teammateTeamPenalty;
          // Çift sayma olmasın diye orijinal takım cezasını çıkar
          baseScore -= player.teamPenalty;
        }
      });
    }
    
    return baseScore;
  }, [players, gameData?.gameMode, roundDetails]);

  const getTeammateIndex = useCallback((playerIndex: number) => {
    if (!gameData || gameData.gameMode !== 'group') return -1;
    
    // Takım eşleşmeleri: 0-2 (1. takım), 1-3 (2. takım)
    if (playerIndex === 0) return 2;
    if (playerIndex === 1) return 3;
    if (playerIndex === 2) return 0;
    if (playerIndex === 3) return 1;
    return -1;
  }, [gameData?.gameMode]);

  const getGroupScores = useCallback(() => {
    if (!gameData || gameData.gameMode !== 'group') return null;
    
    const group1Total = getTotalScore(0) + getTotalScore(2); // Player 1 & 3
    const group2Total = getTotalScore(1) + getTotalScore(3); // Player 2 & 4
    
    return {
      group1: { name: gameData.group1Name!, total: group1Total },
      group2: { name: gameData.group2Name!, total: group2Total }
    };
  }, [gameData, getTotalScore]);

  const getScoreDifferences = useCallback(() => {
    if (!gameData) return null;
    
    if (gameData.gameMode === 'group') {
      const groupScores = getGroupScores();
      if (!groupScores) return null;
      
      const difference = Math.abs(groupScores.group1.total - groupScores.group2.total);
      const leader = groupScores.group1.total < groupScores.group2.total ? groupScores.group1 : groupScores.group2;
      
      return {
        isGroup: true,
        difference,
        leader: leader.name,
        scores: [groupScores.group1, groupScores.group2]
      };
    } else {
      const playerScores = players.map((player, index) => ({
        name: player.name,
        score: getTotalScore(index),
        index
      })).sort((a, b) => a.score - b.score);
      
      const difference = playerScores.length > 1 ? Math.abs(playerScores[0].score - playerScores[1].score) : 0;
      
      return {
        isGroup: false,
        difference,
        leader: playerScores[0].name,
        scores: playerScores
      };
    }
  }, [gameData, getGroupScores, players, getTotalScore]);

  // Oyuncu istatistiklerini hesapla
  const getPlayerStats = useCallback((playerIndex: number) => {
    let totalOkey = 0;
    let totalFinish = 0;
    let totalHandFinish = 0;
    let totalIndividualPenalty = 0;
    let totalTeamPenalty = 0;

    roundDetails.forEach(round => {
      const player = round.players[playerIndex];
      // Çift okey geldiğinde 2 kez saymalı
      if (player.hasOkey1) {
        totalOkey++;
      }
      if (player.hasOkey2) {
        totalOkey++;
      }
      if (player.finished && !player.handFinished) {
        totalFinish++;
      }
      if (player.handFinished) {
        totalHandFinish++;
      }
      if (player.individualPenalty > 0) {
        totalIndividualPenalty += player.individualPenalty / 101; // Her 101 puan 1 ceza
      }
      
      // Takım cezası hesaplaması: Grup modunda takım arkadaşının cezaları da dahil
      if (gameData?.gameMode === 'group') {
        // Bu oyuncunun takım arkadaşının index'ini bul
        const teammateIndex = getTeammateIndex(playerIndex);
        
        // Bu oyuncunun takım cezası
        if (player.teamPenalty > 0) {
          totalTeamPenalty += player.teamPenalty / 101;
        }
        
        // Takım arkadaşının takım cezası da bu oyuncuya yansımalı
        if (teammateIndex !== -1) {
          const teammate = round.players[teammateIndex];
          if (teammate.teamPenalty > 0) {
            totalTeamPenalty += teammate.teamPenalty / 101;
          }
        }
      } else {
        // Tekil modda sadece kendi takım cezası (normalde takım cezası olmamalı ama güvenlik için)
        if (player.teamPenalty > 0) {
          totalTeamPenalty += player.teamPenalty / 101;
        }
      }
    });

    return {
      totalOkey,
      totalFinish,
      totalHandFinish,
      totalIndividualPenalty,
      totalTeamPenalty,
      totalPenalty: totalIndividualPenalty + totalTeamPenalty // Backward compatibility
    };
  }, [roundDetails, gameData?.gameMode, getTeammateIndex]);

  const finishGame = () => {
    openConfirmModal('finish');
  };

  const openConfirmModal = (action: 'finish' | 'newGame') => {
    setConfirmAction(action);
    setShowConfirmModal(true);
  };

  const handleConfirmAction = () => {
    if (confirmAction === 'finish') {
      executeFinishGame();
    } else if (confirmAction === 'newGame') {
      executeNewGame();
    }
    setShowConfirmModal(false);
    setConfirmAction(null);
  };

  // Oyun istatistiklerini hesapla (Supabase için)
  const calculateGameStatistics = (rounds: RoundDetail[], game: GameData) => {
    const playerStats = game.players.map((playerName, playerIndex) => {
      let totalScore = 0;
      let okeyCount = 0;
      let penaltyCount = 0;
      let finishedCount = 0;
      let individualPenaltyTotal = 0;
      let teamPenaltyTotal = 0;

      rounds.forEach(round => {
        const playerData = round.players[playerIndex];
        totalScore += playerData.total;
        if (playerData.hasOkey1) okeyCount++;
        if (playerData.hasOkey2) okeyCount++;
        if (playerData.finished || playerData.handFinished) finishedCount++;
        if (playerData.penalty > 0) penaltyCount++;
        
        // Bireysel ve takım cezalarını topla
        individualPenaltyTotal += playerData.individualPenalty || 0;
        teamPenaltyTotal += playerData.teamPenalty || 0;
      });

      return {
        name: playerName,
        total_score: totalScore,
        okey_count: okeyCount,
        penalty_count: penaltyCount,
        finished_count: finishedCount,
        individual_penalty: individualPenaltyTotal,
        team_penalty: teamPenaltyTotal,
      };
    });

    // Genel istatistikler
    let totalOkeys = 0;
    let totalPenalties = 0;
    let totalFinishedHands = 0;
    let highestRoundScore = 0;
    let lowestRoundScore = 0;

    rounds.forEach(round => {
      round.players.forEach(player => {
        if (player.hasOkey1) totalOkeys++;
        if (player.hasOkey2) totalOkeys++;
        if (player.penalty > 0) totalPenalties++;
        if (player.finished || player.handFinished) totalFinishedHands++;
        
        // En yüksek ve en düşük round puanı
        if (player.total > highestRoundScore) highestRoundScore = player.total;
        if (player.total < lowestRoundScore || lowestRoundScore === 0) lowestRoundScore = player.total;
      });
    });

    // Takım skorları (grup modu için)
    let team1TotalScore = 0;
    let team2TotalScore = 0;
    if (game.gameMode === 'group') {
      team1TotalScore = playerStats[0].total_score + playerStats[2].total_score;
      team2TotalScore = playerStats[1].total_score + playerStats[3].total_score;
    }

    return {
      players: playerStats,
      total_okeys: totalOkeys,
      total_penalties: totalPenalties,
      total_finished_hands: totalFinishedHands,
      highest_round_score: highestRoundScore,
      lowest_round_score: lowestRoundScore,
      team1_total_score: team1TotalScore,
      team2_total_score: team2TotalScore,
    };
  };

  const executeFinishGame = async () => {
    const groupScores = getGroupScores();
    
    // Tüm oyuncular için istatistikleri hesapla
    const playersWithStats = players.map((player, index) => ({
      name: player.name,
      score: getTotalScore(index),
      originalIndex: index,
      stats: getPlayerStats(index),
      isGroup1: gameData?.gameMode === 'group' && (index === 0 || index === 2),
      isGroup2: gameData?.gameMode === 'group' && (index === 1 || index === 3)
    }));

    let endData: any = {
      isGroup: !!groupScores,
      playersWithStats: playersWithStats.sort((a, b) => a.score - b.score) // En az puandan başlayarak sırala
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
      endData.rankings = playersWithStats.map((player, index) => ({
        ...player,
        rank: index + 1
      }));
      
      // Kazanan en az puanlı oyuncu
      endData.winner = playersWithStats[0].name;
      endData.winnerType = 'single';
      endData.winnerScore = playersWithStats[0].score;
    }
    
    // Supabase'e oyun bitişini kaydet (özet + istatistikler)
    try {
      const gameId = localStorage.getItem('currentGameId');
      if (gameId) {
        // İstatistikleri hesapla
        const gameStats = calculateGameStatistics(roundDetails, gameData!);
        
        const requestBody: any = { 
          winner_name: endData.winner,
          winner_type: endData.winnerType,
        };

        // Eğer kullanıcı girişliyse, user_id ve istatistikleri ekle
        if (user) {
          requestBody.user_id = user.id;
          requestBody.game_statistics = gameStats;
        }

        await fetch(`/api/games/${gameId}/finish`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
        
        // Oyun bittiğinde gameId'yi temizle (tekrar finish edilmesin)
        localStorage.removeItem('currentGameId');
      }
    } catch (error) {
      console.error('Oyun bitirme kaydı hatası:', error);
      // Hata olsa bile devam et
    }
    
    setGameEndData(endData);
    setShowGameEndModal(true);
    setShowCalculation(false); // Oyun bitince hesaplamayı kapat
  };

  const executeNewGame = async () => {
    // Tüm localStorage verilerini temizle (yeni sistem ile)
    const { clearGameData } = await import('@/lib/gameStorage');
    clearGameData();
    
    // Ana sayfaya git
    router.push('/');
    setShowCalculation(false); // Yeni oyun başlarken hesaplamayı kapat
  };

  const startNewGame = () => {
    openConfirmModal('newGame');
  };

  const getRoundDetail = (roundIndex: number) => {
    return roundDetails.find(detail => detail.round === roundIndex + 1);
  };

  const startEditRound = (roundIndex: number) => {
    const detail = getRoundDetail(roundIndex);
    if (detail) {
      setEditRoundData(JSON.parse(JSON.stringify(detail))); // Deep copy
      
      // Input değerlerini ayarla (0 ise boş string, değilse değeri göster)
      const pointsInputs = detail.players.map(p => p.points === 0 ? '' : p.points.toString());
      const penaltyInputs = detail.players.map(p => p.penalty === 0 ? '' : p.penalty.toString());
      setEditInputValues({
        points: pointsInputs,
        penalty: penaltyInputs
      });
      
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
    
    // Yeni storage sistemi ile kaydet
    const saveData = async () => {
      const { saveGameData } = await import('@/lib/gameStorage');
      const gameId = localStorage.getItem('currentGameId');
      saveGameData(updatedDetails, gameId);
    };
    saveData();

    // Update player scores
    const updatedPlayers = players.map((player, index) => {
      const newScores = [...player.scores];
      newScores[editRoundData.round - 1] = editRoundData.players[index].total;
      return { ...player, scores: newScores };
    });
    setPlayers(updatedPlayers);

    // Dealer değişikliği sadece yeni round eklenirken yapılmalı, düzenlemede değil

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

    // Önce tüm oyuncuları kopyala
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
      return { ...player };
    });

    // Sonra okey ve finished kontrollerini yap
    if (field === 'hasOkey1' && value === true) {
      // Diğer oyuncuların okey1'ini false yap
      for (let i = 0; i < updatedPlayers.length; i++) {
        if (i !== playerIndex) {
          updatedPlayers[i] = { ...updatedPlayers[i], hasOkey1: false };
        }
      }
    } else if (field === 'hasOkey2' && value === true) {
      // Diğer oyuncuların okey2'sini false yap
      for (let i = 0; i < updatedPlayers.length; i++) {
        if (i !== playerIndex) {
          updatedPlayers[i] = { ...updatedPlayers[i], hasOkey2: false };
        }
      }
    } else if (field === 'finished' && value === true) {
      // Diğer oyuncuların finished'ini false yap
      for (let i = 0; i < updatedPlayers.length; i++) {
        if (i !== playerIndex) {
          updatedPlayers[i] = { ...updatedPlayers[i], finished: false };
          // Finished değiştiğinde total'i yeniden hesapla
          let total = updatedPlayers[i].points + updatedPlayers[i].penalty;
          if (updatedPlayers[i].finished) {
            total -= 101;
          }
          updatedPlayers[i].total = total;
        }
      }
    }

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
        {/* Venue Badge (varsa) */}
        {venue && (
          <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-blue-700 rounded-xl p-3 flex items-center justify-center gap-2">
            {venue.logo_url && (
              <img 
                src={venue.logo_url} 
                alt={venue.name} 
                className="h-6 w-6 object-contain"
              />
            )}
            <span className="text-blue-300 font-semibold text-sm">
              {venue.name}
            </span>
          </div>
        )}

        {/* Header */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-4 md:p-6">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-4 md:mb-6 text-center">101 Oyunu</h1>
          
          {/* Oyuncu Kartları - Mobil Optimize */}
          <div className="grid grid-cols-4 gap-1 sm:gap-2 md:gap-4 mb-4 md:mb-6">
            {players.map((player, index) => {
              const isGroup1 = index === 0 || index === 2;
              
              return (
                <div 
                  key={index} 
                  className={`text-center p-1.5 sm:p-2 md:p-4 rounded-lg md:rounded-xl border-2 transition-all min-h-[4rem] sm:min-h-[5rem] md:min-h-[6rem] ${
                    gameData.gameMode === 'group'
                      ? isGroup1 
                        ? 'bg-blue-900/20 border-blue-600 hover:bg-blue-900/30' 
                        : 'bg-purple-900/20 border-purple-600 hover:bg-purple-900/30'
                      : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                  }`}
                >
                  {/* Oyuncu İsmi - Mobil Optimize */}
                  <div 
                    className="font-semibold text-white group relative leading-tight"
                    title={player.name} // Tooltip
                  >
                    {/* Mobil: Çok küçük font, Desktop: Normal font */}
                    <div className={`${
                      player.name.length > 8 
                        ? 'text-[10px] sm:text-xs md:text-sm' 
                        : player.name.length > 6 
                        ? 'text-[11px] sm:text-xs md:text-base' 
                        : player.name.length > 4
                        ? 'text-xs sm:text-sm md:text-base'
                        : 'text-xs sm:text-sm md:text-lg'
                    }`}>
                      {/* Mobilde word-break ile kelime bölme */}
                      <div className="break-words hyphens-auto" style={{wordBreak: 'break-word', hyphens: 'auto'}}>
                        {player.name}
                      </div>
                    </div>
                    
                    {/* Touch Tooltip - Mobil için */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap">
                      {player.name}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                  
                  {/* Takım Bilgisi - Mobil Optimize */}
                  {gameData.gameMode === 'group' && (
                    <div 
                      className={`mt-0.5 sm:mt-1 font-medium leading-tight ${
                        isGroup1 ? 'text-blue-300' : 'text-purple-300'
                      }`}
                      title={isGroup1 ? gameData.group1Name : gameData.group2Name}
                    >
                      <div className={`break-words ${
                        ((isGroup1 ? gameData.group1Name : gameData.group2Name) || '').length > 8 
                          ? 'text-[9px] sm:text-[10px] md:text-xs' 
                          : 'text-[10px] sm:text-xs md:text-sm'
                      }`} style={{wordBreak: 'break-word'}}>
                        {isGroup1 ? gameData.group1Name : gameData.group2Name}
                      </div>
                    </div>
                  )}

                  
                  
                  {/* Puan - Sadece hesaplama gösterilirken */}
                  {showCalculation && (
                    <div className="mt-1 sm:mt-2 md:mt-3">
                      <div className={`text-sm sm:text-lg md:text-2xl font-bold ${
                        getTotalScore(index) > 0 ? 'text-red-400' : getTotalScore(index) < 0 ? 'text-green-400' : 'text-gray-300'
                      }`}>
                        {getTotalScore(index)}
                      </div>
                      <div className="text-[9px] sm:text-xs text-gray-400">puan</div>
                            </div>
      )}

      {/* Dealer işareti - İsmin altında, küçük */}
      {gameData.dealerIndex === index && (
                    <div className="flex justify-center mt-0.5">
                      <span className="text-green-400 text-[10px]" title="Dağıtan">🟢</span>
                    </div>
                  )}

      {/* Onay Modalı */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-3xl shadow-2xl w-full max-w-md">
            <div className="p-6 text-center">
              {/* İkon */}
              <div className="text-6xl mb-4">
                {confirmAction === 'finish' ? '🏁' : '🎮'}
              </div>
              
              {/* Başlık */}
              <h2 className="text-2xl font-bold text-white mb-4">
                {confirmAction === 'finish' ? 'Oyunu Bitir' : 'Yeni Oyun Başlat'}
              </h2>
              
              {/* Açıklama */}
              <p className="text-gray-300 mb-6 leading-relaxed">
                {confirmAction === 'finish' 
                  ? 'Oyunu bitirmek istediğinizden emin misiniz? Oyun sonuç ekranına geçilecek ve kazanan belirlenecektir.'
                  : 'Yeni oyun başlatmak istediğinizden emin misiniz? Mevcut oyun verileri silinecek ve ana sayfaya yönlendirileceksiniz.'
                }
              </p>
              
              {/* Uyarı */}
              <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-3 mb-6">
                <div className="flex items-center justify-center space-x-2 text-yellow-300">
                  <span>⚠️</span>
                  <span className="text-sm font-medium">
                    {confirmAction === 'finish' 
                      ? 'Bu işlem geri alınamaz!'
                      : 'Tüm round verileri kaybolacak!'
                    }
                  </span>
                </div>
              </div>
              
              {/* Butonlar */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    setConfirmAction(null);
                  }}
                  className="bg-gray-600 hover:bg-gray-500 text-white py-3 px-4 rounded-xl font-semibold transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleConfirmAction}
                  className={`text-white py-3 px-4 rounded-xl font-semibold transition-colors ${
                    confirmAction === 'finish'
                      ? 'bg-red-600 hover:bg-red-500'
                      : 'bg-green-600 hover:bg-green-500'
                  }`}
                >
                  {confirmAction === 'finish' ? 'Evet, Bitir' : 'Evet, Başlat'}
                </button>
              </div>
            </div>
          </div>
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
                  <div 
                    className={`font-semibold text-blue-300 group relative ${
                      (groupScores.group1.name || '').length > 12 
                        ? 'text-sm md:text-base' 
                        : 'text-sm md:text-lg'
                    }`}
                    title={groupScores.group1.name}
                  >
                    <div className="truncate">
                      {groupScores.group1.name}
                    </div>
                    {/* Hover Tooltip */}
                    {(groupScores.group1.name || '').length > 12 && (
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap">
                        {groupScores.group1.name}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                      </div>
                    )}
                  </div>
                  <div className="text-2xl md:text-4xl font-bold text-blue-400 mt-1 md:mt-2">{groupScores.group1.total}</div>
                  <div className="text-xs text-blue-300">toplam</div>
                </div>
                <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 border-2 border-purple-600 rounded-xl p-3 md:p-6 text-center">
                  <div 
                    className={`font-semibold text-purple-300 group relative ${
                      (groupScores.group2.name || '').length > 12 
                        ? 'text-sm md:text-base' 
                        : 'text-sm md:text-lg'
                    }`}
                    title={groupScores.group2.name}
                  >
                    <div className="truncate">
                      {groupScores.group2.name}
                    </div>
                    {/* Hover Tooltip */}
                    {(groupScores.group2.name || '').length > 12 && (
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap">
                        {groupScores.group2.name}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                      </div>
                    )}
                  </div>
                  <div className="text-2xl md:text-4xl font-bold text-purple-400 mt-1 md:mt-2">{groupScores.group2.total}</div>
                  <div className="text-xs text-purple-300">toplam</div>
                </div>
              </div>
            );
          })()}

          {/* Skor Farkları - Hesaplama gösterilirken */}
          {showCalculation && (() => {
            const differences = getScoreDifferences();
            if (!differences) return null;
            
            return (
              <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-4 md:p-6 mb-4 md:mb-6">
                <h3 className="text-lg md:text-xl font-semibold text-white mb-4 text-center flex items-center justify-center space-x-2">
                  <span>📊</span>
                  <span>Skor Durumu</span>
                </h3>
                
                <div className="space-y-4">
                  {/* Lider */}
                  <div className="bg-yellow-900/20 border border-yellow-700 rounded-xl p-3 md:p-4 text-center">
                    <div className="text-yellow-300 text-sm md:text-base font-medium mb-1">
                      🏆 Şu an önde
                    </div>
                    <div className="text-yellow-400 text-lg md:text-xl font-bold">
                      {differences.leader}
                    </div>
                  </div>
                  
                  {/* Fark */}
                  <div className="bg-blue-900/20 border border-blue-700 rounded-xl p-3 md:p-4 text-center">
                    <div className="text-blue-300 text-sm md:text-base font-medium mb-1">
                      📈 {differences.isGroup ? 'Takımlar' : 'Oyuncular'} Arası Fark
                    </div>
                    <div className="text-blue-400 text-xl md:text-2xl font-bold">
                      {differences.difference} puan
                    </div>
                    {differences.difference === 0 && (
                      <div className="text-gray-400 text-sm mt-1">
                        🤝 Berabere durumda!
                      </div>
                    )}
                  </div>
                  

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
              <div className="bg-gray-600 p-2 md:p-3 border-b border-gray-500">
                <div className="grid grid-cols-6 gap-1 md:gap-3">
                  <div className="text-gray-300 font-semibold text-[10px] sm:text-xs md:text-sm text-center">Round</div>
                  {players.map((player, playerIndex) => {
                    const isGroup1 = playerIndex === 0 || playerIndex === 2;
                    return (
                      <div key={playerIndex} className="text-center">
                        <div 
                          className={`font-semibold group relative leading-tight ${
                            gameData.gameMode === 'group'
                              ? isGroup1 ? 'text-blue-300' : 'text-purple-300'
                              : 'text-gray-300'
                          }`}
                          title={player.name}
                        >
                          <div className={`break-words ${
                            player.name.length > 8 
                              ? 'text-[9px] sm:text-[10px] md:text-xs' 
                              : player.name.length > 6 
                              ? 'text-[10px] sm:text-xs md:text-sm' 
                              : 'text-[10px] sm:text-xs md:text-sm'
                          }`} style={{wordBreak: 'break-word', hyphens: 'auto'}}>
                            {player.name}
                          </div>
                          
                          {/* Touch Tooltip - Mobil için */}
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap">
                            {player.name}
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="text-gray-300 font-semibold text-[10px] sm:text-xs md:text-sm text-center">İşlemler</div>
                </div>
              </div>

              {/* Rounds - Sadece Puanlar */}
              <div className="space-y-1">
                {players[0].scores.map((_, roundIndex) => (
                  <div key={roundIndex} className="p-1.5 sm:p-2 md:p-3 hover:bg-gray-650 transition-colors">
                    <div className="grid grid-cols-6 gap-1 sm:gap-2 md:gap-3 items-center">
                      {/* Round Number */}
                      <div className="text-center">
                        <span className="text-white font-medium text-xs sm:text-sm">{roundIndex + 1}</span>
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

                      {/* Action Buttons */}
                      <div className="flex items-center justify-center space-x-1 sm:space-x-2">
                        <button
                          onClick={() => {
                            setSelectedRoundDetails(selectedRoundDetails === roundIndex ? null : roundIndex);
                            setShowCalculation(false); // Detay açıldığında hesaplamayı kapat
                            setIsEditMode(false); // Edit modu kapat
                          }}
                          className="bg-blue-600 hover:bg-blue-500 text-white p-1.5 sm:p-2 rounded-lg transition-colors group relative"
                          title="Detayları Gör"
                        >
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          {/* Tooltip */}
                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                            Detayları Gör
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-2 border-transparent border-t-gray-900"></div>
                          </div>
                        </button>
                        <button
                          onClick={() => {
                            startEditRound(roundIndex);
                            setSelectedRoundDetails(null);
                            setShowCalculation(false);
                          }}
                          className="bg-orange-600 hover:bg-orange-500 text-white p-1.5 sm:p-2 rounded-lg transition-colors group relative"
                          title="Düzenle"
                        >
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          {/* Tooltip */}
                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                            Düzenle
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-2 border-transparent border-t-gray-900"></div>
                          </div>
                        </button>
                      </div>
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
            onClick={finishGame}
            className="bg-red-600 hover:bg-red-500 text-white py-3 md:py-4 px-4 md:px-6 rounded-xl font-semibold text-base md:text-lg transition-all shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center space-x-2"
          >
            <span className="text-xl">🏁</span>
            <span>Oyunu Bitir</span>
          </button>

          <button
            onClick={startNewGame}
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
                        <div className="bg-gray-600 grid grid-cols-7 gap-2 p-3 text-xs md:text-sm font-semibold">
                          <div className="text-gray-300 text-center">Oyuncu</div>
                          <div className="text-gray-300 text-center">Puan</div>
                          <div className="text-gray-300 text-center">B.Ceza</div>
                          <div className="text-gray-300 text-center">T.Ceza</div>
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
                            className={`grid grid-cols-7 gap-2 p-3 border-b border-gray-600 last:border-b-0 ${
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

                            {/* Individual Penalty */}
                            <div className="text-center">
                              <div className="font-bold text-sm text-orange-400">
                                {player.individualPenalty || '-'}
                              </div>
                            </div>

                            {/* Team Penalty */}
                            <div className="text-center">
                              <div className="font-bold text-sm text-red-400">
                                {(gameData?.gameMode === 'group' && player.teamPenalty) ? player.teamPenalty : '-'}
                              </div>
                            </div>

                            {/* Okey */}
                            <div className="text-center">
                              <div className="font-bold text-sm text-amber-400">
                                {[player.hasOkey1 && '⚪', player.hasOkey2 && '⚪'].filter(Boolean).join(' ') || '-'}
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
                          type="text"
                          inputMode="decimal"
                          pattern="^-?\d*$"
                          value={editInputValues.points[index]}
                          onChange={(e) => {
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
                            const newInputValues = { ...editInputValues };
                            newInputValues.points[index] = value;
                            setEditInputValues(newInputValues);
                            
                            // Sayısal değeri hesapla ve kaydet
                            if (value === '' || value === '-') {
                              updateEditPlayerData(index, 'points', 0);
                            } else {
                              const numValue = parseInt(value);
                              if (!isNaN(numValue) && numValue >= -999 && numValue <= 999) {
                                updateEditPlayerData(index, 'points', numValue);
                              }
                            }
                          }}
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-center text-base placeholder-gray-400"
                          placeholder="0"
                          maxLength={4}
                        />
                      </div>

                      {/* Penalty */}
                      <div className="text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="^\d*$"
                          value={editInputValues.penalty[index]}
                          onChange={(e) => {
                            let value = e.target.value;
                            
                            // Sadece sayı kabul et (ceza negatif olamaz)
                            if (!/^\d*$/.test(value)) {
                              return; // Geçersiz karakterleri reddet
                            }
                            
                            // Input değerini her zaman güncelle (görsel için)
                            const newInputValues = { ...editInputValues };
                            newInputValues.penalty[index] = value;
                            setEditInputValues(newInputValues);
                            
                            // Sayısal değeri hesapla ve kaydet
                            if (value === '') {
                              updateEditPlayerData(index, 'penalty', 0);
                            } else {
                              const numValue = parseInt(value);
                              if (!isNaN(numValue) && numValue >= 0 && numValue <= 9999) {
                                updateEditPlayerData(index, 'penalty', numValue);
                              }
                            }
                          }}
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-center text-base placeholder-gray-400"
                          placeholder="0"
                          maxLength={4}
                        />
                      </div>

                      {/* Okey */}
                      <div className="text-center flex justify-center space-x-1">
                        <button
                          onClick={() => updateEditPlayerData(index, 'hasOkey1', !player.hasOkey1)}
                          className={`w-6 h-6 rounded-full text-xs font-bold transition-colors ${
                            player.hasOkey1
                              ? 'bg-amber-600 text-white shadow-lg'
                              : 'bg-amber-900/30 border border-amber-700 text-amber-300 hover:bg-amber-800/50'
                          }`}
                          title="İlk Okey"
                        >
                          ⚪
                        </button>
                        <button
                          onClick={() => updateEditPlayerData(index, 'hasOkey2', !player.hasOkey2)}
                          className={`w-6 h-6 rounded-full text-xs font-bold transition-colors ${
                            player.hasOkey2
                              ? 'bg-amber-600 text-white shadow-lg'
                              : 'bg-amber-900/30 border border-amber-700 text-amber-300 hover:bg-amber-800/50'
                          }`}
                          title="İkinci Okey"
                        >
                          ⚪
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
          <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-xl max-h-[95vh] overflow-y-auto">
            <div className="p-6 text-center">
              {/* Başlık */}
              <div className="mb-6">
                <div className="text-4xl mb-3">
                  {gameEndData.winnerType === 'tie' ? '🤝' : '🏆'}
                </div>
                <h2 className="text-xl font-bold text-white mb-1">
                  {gameEndData.winnerType === 'tie' ? 'Berabere!' : 'Oyun Bitti!'}
                </h2>
                <p className="text-sm text-gray-300">Tebrikler!</p>
              </div>

              {/* Kazanan */}
              <div className="mb-6 p-4 bg-gradient-to-r from-yellow-900/50 to-amber-900/50 border border-yellow-700 rounded-lg">
                <div className="text-sm text-yellow-300 mb-1">
                  {gameEndData.winnerType === 'tie' ? 'Sonuç' : 'Kazanan'}
                </div>
                <div className="text-lg font-bold text-yellow-400 mb-1">
                  {gameEndData.winner}
                </div>
                {gameEndData.winnerType === 'single' && gameEndData.winnerScore !== undefined && (
                  <div className="text-xs text-yellow-200">
                    En az puan: {gameEndData.winnerScore}
                  </div>
                )}
                {gameEndData.winnerType !== 'tie' && (
                  <div className="text-xs text-yellow-200/70 mt-1">
                    🎯 En az puan alan kazanır!
                  </div>
                )}
              </div>

              {/* Sonuçlar */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3 text-center">Final Sonuçları</h3>
                
                {/* Takım Skorları - Sadece Grup Modunda */}
                {gameEndData.isGroup && (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className={`p-3 rounded-lg text-center border ${
                        gameEndData.winnerType === 'group1' 
                        ? 'border-green-500 bg-green-900/20' 
                        : 'border-gray-600 bg-gray-700/50'
                      }`}>
                      <div className="text-sm font-medium text-blue-300">
                          {gameEndData.groupScores.group1.name}
                        </div>
                      <div className="text-xl font-bold text-white">
                          {gameEndData.groupScores.group1.total}
                        </div>
                      </div>
                    <div className={`p-3 rounded-lg text-center border ${
                        gameEndData.winnerType === 'group2' 
                        ? 'border-green-500 bg-green-900/20' 
                        : 'border-gray-600 bg-gray-700/50'
                      }`}>
                      <div className="text-sm font-medium text-purple-300">
                          {gameEndData.groupScores.group2.name}
                        </div>
                      <div className="text-xl font-bold text-white">
                          {gameEndData.groupScores.group2.total}
                        </div>
                        </div>
                      </div>
                    )}
                    
                {/* Oyuncu Tablosu */}
                <div className="bg-gray-700 rounded-lg overflow-hidden">
                  {/* Tablo Header */}
                  <div className={`bg-gray-600 grid gap-2 p-2 text-xs font-medium text-gray-300 ${
                    gameEndData.isGroup ? 'grid-cols-6' : 'grid-cols-5'
                  }`}>
                    <div className="text-center">Oyuncu</div>
                    <div className="text-center">Puan</div>
                    <div className="text-center">Okey</div>
                    <div className="text-center">Bitirdi</div>
                    <div className="text-center">B.Ceza</div>
                    {gameEndData.isGroup && <div className="text-center">T.Ceza</div>}
                      </div>
                      
                  {/* Oyuncu Satırları */}
                  {(gameEndData.playersWithStats || gameEndData.rankings)?.map((player: any, index: number) => (
                          <div 
                            key={index} 
                      className={`grid gap-2 py-4 px-2 text-xs border-b border-gray-600 last:border-b-0 min-h-[56px] items-stretch ${
                        gameEndData.isGroup ? 'grid-cols-6' : 'grid-cols-5'
                      } ${
                              index === 0 
                          ? 'bg-yellow-900/20 text-yellow-200' 
                          : 'text-gray-300'
                      }`}
                    >
                      {/* Oyuncu */}
                      <div className="flex items-center justify-center">
                        <div className={`font-medium leading-tight text-center break-words ${
                          gameEndData.isGroup 
                            ? (player.isGroup1 ? 'text-blue-300' : 'text-purple-300')
                            : 'text-white'
                        }`}>
                          {index === 0 ? '🏆' : `${index + 1}.`} {player.name}
                                </div>
                              </div>
                              
                      {/* Puan (Nihai Sonuç) */}
                      <div className="flex items-center justify-center">
                        <div className={`font-bold text-sm ${
                                  player.score > 0 ? 'text-red-400' : player.score < 0 ? 'text-green-400' : 'text-gray-300'
                                }`}>
                                  {player.score}
                              </div>
                            </div>
                            
                      {/* Okey (İstatistik) */}
                      <div className="flex items-center justify-center">
                        <div className={`font-medium ${
                          (player.stats?.totalOkey || 0) > 0 ? 'text-amber-400' : 'text-gray-500'
                        }`}>
                          {player.stats?.totalOkey || 0}
                               </div>
                               </div>
                               
                      {/* Bitirdi (İstatistik) */}
                      <div className="flex items-center justify-center">
                        <div className={`font-medium ${
                          ((player.stats?.totalFinish || 0) + (player.stats?.totalHandFinish || 0)) > 0 ? 'text-green-400' : 'text-gray-500'
                        }`}>
                          {(player.stats?.totalFinish || 0) + (player.stats?.totalHandFinish || 0)}
                        </div>
                               </div>
                               
                      {/* Bireysel Ceza (İstatistik) */}
                      <div className="flex items-center justify-center">
                        <div className={`font-medium ${
                          (player.stats?.totalIndividualPenalty || 0) > 0 ? 'text-orange-400' : 'text-gray-500'
                        }`}>
                          {player.stats?.totalIndividualPenalty || 0}
                        </div>
                               </div>
                               
                      {/* Takım Cezası (İstatistik) - Sadece grup modunda */}
                      {gameEndData.isGroup && (
                        <div className="flex items-center justify-center">
                          <div className={`font-medium ${
                            (player.stats?.totalTeamPenalty || 0) > 0 ? 'text-red-400' : 'text-gray-500'
                          }`}>
                            {player.stats?.totalTeamPenalty || 0}
                                 </div>
                                 </div>
                               )}
                          </div>
                        ))}
                    </div>

                {/* Fark Bilgisi */}
                {gameEndData.winnerType !== 'tie' && (
                  <div className="mt-3 text-center">
                    <div className="text-xs text-gray-400">
                      {gameEndData.isGroup 
                        ? `Takımlar arası fark: ${Math.abs(gameEndData.groupScores.group1.total - gameEndData.groupScores.group2.total)} puan`
                        : gameEndData.rankings && gameEndData.rankings.length > 1 
                        ? `1. ve 2. oyuncu arası fark: ${Math.abs(gameEndData.rankings[0].score - gameEndData.rankings[1].score)} puan`
                        : ''
                      }
                    </div>
                  </div>
                )}

                                {/* En Yüksek Puanlı Oyuncu */}
                {(gameEndData.rankings || gameEndData.playersWithStats) && (() => {
                  const lastPlayerName = gameEndData.isGroup 
                    ? gameEndData.playersWithStats[gameEndData.playersWithStats.length - 1].name
                    : gameEndData.rankings[gameEndData.rankings.length - 1].name;
                  
                  const lastPlayerScore = gameEndData.isGroup 
                    ? gameEndData.playersWithStats[gameEndData.playersWithStats.length - 1].score
                    : gameEndData.rankings[gameEndData.rankings.length - 1].score;
                  
                  return (
                    <div className="mt-4 p-4 bg-gradient-to-r from-gray-700/50 to-gray-600/50 border border-gray-500 rounded-xl">
                      <div className="text-center">
                        <div className="text-3xl mb-2">📊</div>
                        <div className="text-gray-300 font-semibold text-sm mb-1">
                          En Yüksek Puan
                        </div>
                        <div className="text-gray-400 font-bold text-lg mb-1">
                          {lastPlayerName}
                        </div>
                        <div className="text-gray-200 text-xs mb-2">
                          {lastPlayerScore} puan ile en yüksek skora sahip
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Butonlar */}
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => {
                    setShowGameEndModal(false);
                    startNewGame();
                  }}
                  className="bg-green-600 hover:bg-green-500 text-white py-3 px-4 rounded-lg font-semibold text-base transition-colors shadow-lg hover:shadow-xl"
                >
                  🎮 Yeni Oyun Başlat
                </button>
                
                <button
                  onClick={async () => {
                    setShowGameEndModal(false);
                    // Oyun verilerini temizle
                    const { clearGameData } = await import('@/lib/gameStorage');
                    clearGameData();
                    // Ana sayfaya yönlendir
                    router.push('/');
                  }}
                  className="bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded-lg font-medium transition-colors"
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

export default function GamePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-gray-300 text-xl">Yükleniyor...</div>
      </div>
    }>
      <GamePageContent />
    </Suspense>
  );
} 