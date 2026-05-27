'use client';

import { useState, useEffect, Suspense, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ChartIcon, FlagIcon, RefreshIcon, TrophyIcon, EqualIcon, CheckCircleIcon } from '@/components/Icons';
import { Logo } from '@/components/Logo';

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
  dealerIndex: number;
}

function GamePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
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

      const storedDetails = JSON.parse(localStorage.getItem('roundDetails') || '[]');
      const seen = new Set<number>();
      const uniqueDetails = storedDetails.filter((d: RoundDetail) => {
        if (seen.has(d.round)) return false;
        seen.add(d.round);
        return true;
      });
      if (uniqueDetails.length !== storedDetails.length) {
        localStorage.setItem('roundDetails', JSON.stringify(uniqueDetails));
      }
      setRoundDetails(uniqueDetails);

      let initialPlayers: Player[] = playerNames.map(name => ({ name, scores: [] as number[] }));
      let nextRound = 1;

      if (scores && round) {
        const roundNum = parseInt(round);
        uniqueDetails.forEach((detail: RoundDetail) => {
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
        uniqueDetails.forEach((detail: RoundDetail) => {
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
    setShowCalculation(false);
    const params = new URLSearchParams({
      mode: gameData.gameMode,
      player1: gameData.players[0],
      player2: gameData.players[1],
      player3: gameData.players[2],
      player4: gameData.players[3],
      round: currentRound.toString(),
      dealer: gameData.dealerIndex.toString(),
    });
    if (gameData.gameMode === 'group') {
      params.append('group1', gameData.group1Name!);
      params.append('group2', gameData.group2Name!);
    }
    router.push(`/game/round?${params.toString()}`);
  }, [gameData, currentRound, router]);

  const calculateTotals = useCallback(() => { setShowCalculation(true); }, []);

  const getTeammateIndex = useCallback((playerIndex: number) => {
    if (!gameData || gameData.gameMode !== 'group') return -1;
    if (playerIndex === 0) return 2;
    if (playerIndex === 1) return 3;
    if (playerIndex === 2) return 0;
    if (playerIndex === 3) return 1;
    return -1;
  }, [gameData?.gameMode]);

  // Tüm oyuncuların toplam skorları — veri değiştiğinde bir kez hesaplanır
  const totalScores = useMemo(() => {
    const isGroup = gameData?.gameMode === 'group';
    return players.map((player, index) => {
      let score = player.scores.reduce((sum, s) => sum + s, 0);
      if (isGroup) {
        const ti = index === 0 ? 2 : index === 2 ? 0 : index === 1 ? 3 : 1;
        roundDetails.forEach(round => {
          const p = round.players[index];
          const t = round.players[ti];
          if (p && t) score += p.teamPenalty / 2 + t.teamPenalty / 2 - p.teamPenalty;
        });
      }
      return score;
    });
  }, [players, gameData?.gameMode, roundDetails]);

  const getTotalScore = useCallback((playerIndex: number) => totalScores[playerIndex] ?? 0, [totalScores]);

  const getGroupScores = useCallback(() => {
    if (!gameData || gameData.gameMode !== 'group') return null;
    const group1Total = getTotalScore(0) + getTotalScore(2);
    const group2Total = getTotalScore(1) + getTotalScore(3);
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
      return { isGroup: true, difference, leader: leader.name, scores: [groupScores.group1, groupScores.group2] };
    } else {
      const playerScores = players.map((player, index) => ({
        name: player.name, score: getTotalScore(index), index
      })).sort((a, b) => a.score - b.score);
      const difference = playerScores.length > 1 ? Math.abs(playerScores[0].score - playerScores[1].score) : 0;
      return { isGroup: false, difference, leader: playerScores[0].name, scores: playerScores };
    }
  }, [gameData, getGroupScores, players, getTotalScore]);

  const getPlayerStats = useCallback((playerIndex: number) => {
    let totalOkey = 0, totalFinish = 0, totalHandFinish = 0, totalIndividualPenalty = 0, totalTeamPenalty = 0;
    roundDetails.forEach(round => {
      const player = round.players[playerIndex];
      if (player.hasOkey1) totalOkey++;
      if (player.hasOkey2) totalOkey++;
      if (player.finished && !player.handFinished) totalFinish++;
      if (player.handFinished) totalHandFinish++;
      if (player.individualPenalty > 0) totalIndividualPenalty += player.individualPenalty / 101;
      if (gameData?.gameMode === 'group') {
        const teammateIndex = getTeammateIndex(playerIndex);
        if (player.teamPenalty > 0) totalTeamPenalty += player.teamPenalty / 101;
        if (teammateIndex !== -1) {
          const teammate = round.players[teammateIndex];
          if (teammate.teamPenalty > 0) totalTeamPenalty += teammate.teamPenalty / 101;
        }
      } else {
        if (player.teamPenalty > 0) totalTeamPenalty += player.teamPenalty / 101;
      }
    });
    return { totalOkey, totalFinish, totalHandFinish, totalIndividualPenalty, totalTeamPenalty, totalPenalty: totalIndividualPenalty + totalTeamPenalty };
  }, [roundDetails, gameData?.gameMode, getTeammateIndex]);

  const finishGame = () => openConfirmModal('finish');
  const startNewGame = () => openConfirmModal('newGame');

  const openConfirmModal = (action: 'finish' | 'newGame') => {
    setConfirmAction(action);
    setShowConfirmModal(true);
  };

  const handleConfirmAction = () => {
    if (confirmAction === 'finish') executeFinishGame();
    else if (confirmAction === 'newGame') executeNewGame();
    setShowConfirmModal(false);
    setConfirmAction(null);
  };

  const calculateGameStatistics = (rounds: RoundDetail[], game: GameData) => {
    const playerStats = game.players.map((playerName, playerIndex) => {
      let totalScore = 0, okeyCount = 0, penaltyCount = 0, finishedCount = 0, individualPenaltyTotal = 0, teamPenaltyTotal = 0;
      rounds.forEach(round => {
        const playerData = round.players[playerIndex];
        totalScore += playerData.total;
        if (playerData.hasOkey1) okeyCount++;
        if (playerData.hasOkey2) okeyCount++;
        if (playerData.finished || playerData.handFinished) finishedCount++;
        if (playerData.penalty > 0) penaltyCount++;
        individualPenaltyTotal += playerData.individualPenalty || 0;
        teamPenaltyTotal += playerData.teamPenalty || 0;
      });
      return { name: playerName, total_score: totalScore, okey_count: okeyCount, penalty_count: penaltyCount, finished_count: finishedCount, individual_penalty: individualPenaltyTotal, team_penalty: teamPenaltyTotal };
    });
    let totalOkeys = 0, totalPenalties = 0, totalFinishedHands = 0, highestRoundScore = 0, lowestRoundScore = 0;
    rounds.forEach(round => {
      round.players.forEach(player => {
        if (player.hasOkey1) totalOkeys++;
        if (player.hasOkey2) totalOkeys++;
        if (player.penalty > 0) totalPenalties++;
        if (player.finished || player.handFinished) totalFinishedHands++;
        if (player.total > highestRoundScore) highestRoundScore = player.total;
        if (player.total < lowestRoundScore || lowestRoundScore === 0) lowestRoundScore = player.total;
      });
    });
    let team1TotalScore = 0, team2TotalScore = 0;
    if (game.gameMode === 'group') {
      team1TotalScore = playerStats[0].total_score + playerStats[2].total_score;
      team2TotalScore = playerStats[1].total_score + playerStats[3].total_score;
    }
    return { players: playerStats, total_okeys: totalOkeys, total_penalties: totalPenalties, total_finished_hands: totalFinishedHands, highest_round_score: highestRoundScore, lowest_round_score: lowestRoundScore, team1_total_score: team1TotalScore, team2_total_score: team2TotalScore };
  };

  const executeFinishGame = async () => {
    const groupScores = getGroupScores();
    const playersWithStats = players.map((player, index) => ({
      name: player.name, score: getTotalScore(index), originalIndex: index, stats: getPlayerStats(index),
      isGroup1: gameData?.gameMode === 'group' && (index === 0 || index === 2),
      isGroup2: gameData?.gameMode === 'group' && (index === 1 || index === 3)
    }));
    const sortedPlayers = playersWithStats.sort((a, b) => a.score - b.score);
    let endData: any = { isGroup: !!groupScores, playersWithStats: sortedPlayers };
    if (groupScores) {
      endData.groupScores = groupScores;
      if (groupScores.group1.total < groupScores.group2.total) { endData.winner = groupScores.group1.name; endData.winnerType = 'group1'; }
      else if (groupScores.group2.total < groupScores.group1.total) { endData.winner = groupScores.group2.name; endData.winnerType = 'group2'; }
      else { endData.winner = 'Berabere'; endData.winnerType = 'tie'; }
      endData.scoreFark = Math.abs(groupScores.group1.total - groupScores.group2.total);
    } else {
      endData.rankings = sortedPlayers.map((player, index) => ({ ...player, rank: index + 1 }));
      endData.winner = sortedPlayers[0].name;
      endData.winnerType = 'single';
      endData.winnerScore = sortedPlayers[0].score;
      endData.scoreFark = sortedPlayers.length > 1 ? Math.abs(sortedPlayers[0].score - sortedPlayers[1].score) : 0;
    }
    try {
      const gameId = localStorage.getItem('currentGameId');
      if (gameId) {
        const gameStats = calculateGameStatistics(roundDetails, gameData!);
        const requestBody: any = { winner_name: endData.winner, winner_type: endData.winnerType };
        if (user) { requestBody.user_id = user.id; requestBody.game_statistics = gameStats; requestBody.user_won = false; }
        await fetch(`/api/games/${gameId}/finish`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        localStorage.removeItem('currentGameId');
      }
    } catch (error) { console.error('Oyun bitirme kaydı hatası:', error); }
    setGameEndData(endData);
    setShowGameEndModal(true);
    setShowCalculation(false);
  };

  const executeNewGame = async () => {
    localStorage.removeItem('roundDetails');
    localStorage.removeItem('currentGameId');
    router.push('/');
    setShowCalculation(false);
  };

  const getRoundDetail = (roundIndex: number) => roundDetails.find(detail => detail.round === roundIndex + 1);

  const startEditRound = (roundIndex: number) => {
    const detail = getRoundDetail(roundIndex);
    if (detail) {
      setEditRoundData(JSON.parse(JSON.stringify(detail)));
      setEditInputValues({
        points: detail.players.map(p => p.points === 0 ? '' : p.points.toString()),
        penalty: detail.players.map(p => p.penalty === 0 ? '' : p.penalty.toString())
      });
      setIsEditMode(true);
    }
  };

  const saveRoundEdit = () => {
    if (!editRoundData) return;
    const updatedDetails = roundDetails.map(detail => detail.round === editRoundData.round ? editRoundData : detail);
    setRoundDetails(updatedDetails);
    localStorage.setItem('roundDetails', JSON.stringify(updatedDetails));
    const updatedPlayers = players.map((player, index) => {
      const newScores = [...player.scores];
      newScores[editRoundData.round - 1] = editRoundData.players[index].total;
      return { ...player, scores: newScores };
    });
    setPlayers(updatedPlayers);
    setIsEditMode(false);
    setEditRoundData(null);
    setShowCalculation(false);
  };

  const cancelRoundEdit = () => { setIsEditMode(false); setEditRoundData(null); };

  const updateEditPlayerData = (playerIndex: number, field: string, value: any) => {
    if (!editRoundData) return;
    const updatedPlayers = editRoundData.players.map((player, index) => {
      if (index === playerIndex) {
        const updatedPlayer = { ...player, [field]: value };
        let total = updatedPlayer.points + updatedPlayer.penalty;
        if (updatedPlayer.finished && !updatedPlayer.handFinished) total -= 101;
        updatedPlayer.total = total;
        return updatedPlayer;
      }
      return { ...player };
    });
    if (field === 'hasOkey1' && value === true) {
      for (let i = 0; i < updatedPlayers.length; i++) { if (i !== playerIndex) updatedPlayers[i] = { ...updatedPlayers[i], hasOkey1: false }; }
    } else if (field === 'hasOkey2' && value === true) {
      for (let i = 0; i < updatedPlayers.length; i++) { if (i !== playerIndex) updatedPlayers[i] = { ...updatedPlayers[i], hasOkey2: false }; }
    } else if (field === 'finished' && value === true) {
      for (let i = 0; i < updatedPlayers.length; i++) {
        if (i !== playerIndex) {
          updatedPlayers[i] = { ...updatedPlayers[i], finished: false };
          let total = updatedPlayers[i].points + updatedPlayers[i].penalty;
          if (updatedPlayers[i].finished) total -= 101;
          updatedPlayers[i].total = total;
        }
      }
    }
    setEditRoundData({ ...editRoundData, players: updatedPlayers });
  };

  const glassCard = 'bg-s1 border border-sep rounded-2xl';
  const modalBase = 'fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50';
  const modalCard = 'bg-s1 border border-sep rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto';

  if (!gameData) {
    return (
      <div className="min-h-screen bg-s0 flex items-center justify-center">
        <div className="text-l3 text-sm">Yükleniyor...</div>
      </div>
    );
  }

  const isGroupMode = gameData.gameMode === 'group';
  const displayOrder = isGroupMode ? [0, 2, 1, 3] : [0, 1, 2, 3];

  return (
    <div className="min-h-screen bg-s0">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-s0h backdrop-blur-md border-b border-sep">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo size="sm" />
          <ThemeToggle />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
        {/* Player Cards */}
        <div className={`${glassCard} p-3`}>
          {isGroupMode && (
            <div className="grid grid-cols-2 px-1 pb-2">
              <p className="text-[10px] font-semibold text-l3 text-center uppercase tracking-widest">{gameData.group1Name}</p>
              <p className="text-[10px] font-semibold text-l3 text-center uppercase tracking-widest">{gameData.group2Name}</p>
            </div>
          )}
          <div className={`${isGroupMode ? 'relative ' : ''}grid grid-cols-4 gap-2`}>
            {isGroupMode && <div className="absolute inset-y-0 left-1/2 w-px bg-sep -translate-x-px pointer-events-none" />}
            {displayOrder.map((index) => {
              const player = players[index];
              return (
                <div
                  key={index}
                  className={`rounded-xl p-2.5 text-center ${
                    gameData.dealerIndex === index
                      ? 'border-2 border-ablue bg-s2'
                      : 'border bg-s2 border-sep'
                  }`}
                >
                  <div className="font-semibold text-xs leading-tight text-l1" style={{wordBreak: 'break-word'}}>
                    {player.name}
                  </div>
                  {showCalculation && (
                    <div className="mt-2 pt-2 border-t border-sep">
                      <div className={`text-sm font-bold ${
                        getTotalScore(index) < 0 ? 'text-agreen' : 'text-l1'
                      }`}>
                        {getTotalScore(index)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Group totals */}
          {showCalculation && isGroupMode && (() => {
            const g = getGroupScores()!;
            return (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="bg-s2 border border-sep rounded-xl px-3 py-2.5 text-center">
                  <div className="text-l3 text-[11px] font-medium truncate">{g.group1.name}</div>
                  <div className={`text-xl font-bold mt-0.5 ${g.group1.total < 0 ? 'text-agreen' : 'text-l1'}`}>{g.group1.total}</div>
                </div>
                <div className="bg-s2 border border-sep rounded-xl px-3 py-2.5 text-center">
                  <div className="text-l3 text-[11px] font-medium truncate">{g.group2.name}</div>
                  <div className={`text-xl font-bold mt-0.5 ${g.group2.total < 0 ? 'text-agreen' : 'text-l1'}`}>{g.group2.total}</div>
                </div>
              </div>
            );
          })()}

          {/* Score difference */}
          {showCalculation && (() => {
            const diff = getScoreDifferences();
            if (!diff) return null;
            return (
              <div className="mt-2 grid grid-cols-2 divide-x divide-sep bg-s2 rounded-xl overflow-hidden">
                <div className="px-4 py-3">
                  <div className="text-[10px] text-l3 uppercase tracking-widest mb-1">Önde</div>
                  <div className="text-ablue font-bold text-sm truncate">{diff.leader}</div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[10px] text-l3 uppercase tracking-widest mb-1">Fark</div>
                  <div className="text-l1 font-bold text-sm">{diff.difference} <span className="text-l3 font-normal text-xs">puan</span></div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Round History */}
        <div className={`${glassCard} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-sep flex items-center justify-between">
            <h2 className="text-l3 text-xs font-medium uppercase tracking-wide">Round Geçmişi</h2>
            <span className="text-l4 text-xs">{players[0]?.scores.length || 0} round</span>
          </div>

          {players[0]?.scores.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-l4 text-sm">Henüz round oynanmadı</p>
            </div>
          ) : (
            <div>
              <div className="grid gap-1 px-3 py-2 bg-s2" style={{gridTemplateColumns:'1.5rem 1fr 1fr 1fr 1fr 2rem'}}>
                <div className="text-l4 text-[10px] text-center">#</div>
                {displayOrder.map((idx, colIdx) => (
                  <div key={idx} className={`text-[10px] text-center font-medium truncate px-0.5 text-l3 min-w-0 ${isGroupMode && colIdx === 2 ? 'border-l border-sep' : ''}`}>
                    {players[idx].name}
                  </div>
                ))}
                <div />
              </div>

              {players[0].scores.map((_, roundIndex) => (
                <div key={roundIndex} className="grid gap-1 px-3 py-2 border-t border-sep hover:bg-s2 transition-colors" style={{gridTemplateColumns:'1.5rem 1fr 1fr 1fr 1fr 2rem'}}>
                  <div className="text-l3 text-xs text-center self-center">{roundIndex + 1}</div>
                  {displayOrder.map((playerIndex, colIdx) => {
                    const score = players[playerIndex].scores[roundIndex];
                    return (
                      <div key={playerIndex} className={`text-center self-center ${isGroupMode && colIdx === 2 ? 'border-l border-sep' : ''}`}>
                        <span className={`text-xs font-bold ${score < 0 ? 'text-agreen' : 'text-l1'}`}>
                          {score}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => {
                        startEditRound(roundIndex);
                        setSelectedRoundDetails(null);
                        setShowCalculation(false);
                      }}
                      className="w-6 h-6 rounded-full bg-[var(--team1-bg)] border border-[var(--team1-border)] text-ablue flex items-center justify-center transition-colors active:scale-[0.93] touch-manipulation"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="5" cy="12" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="19" cy="12" r="2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Round */}
        <div className={`${glassCard} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-l3 text-sm">Sonraki round</span>
            <span className="text-l1 font-semibold text-sm">Round {currentRound}</span>
          </div>
          <button
            onClick={goToRoundPage}
            className="w-full bg-ablue hover:opacity-90 active:scale-[0.98] text-white font-bold py-4 rounded-xl text-base transition-all touch-manipulation"
          >
            + Yeni Round Ekle
          </button>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2 pb-4">
          <button
            onClick={() => { calculateTotals(); setSelectedRoundDetails(null); }}
            className="bg-s2 hover:opacity-90 active:scale-[0.97] border border-sep py-3.5 rounded-xl text-sm font-medium transition-all touch-manipulation flex flex-col items-center gap-1"
          >
            <ChartIcon className="w-5 h-5 text-ablue" />
            <span className="text-xs text-l2">Skorlar</span>
          </button>
          <button
            onClick={startNewGame}
            className="bg-s2 hover:opacity-90 active:scale-[0.97] border border-sep py-3.5 rounded-xl text-sm font-medium transition-all touch-manipulation flex flex-col items-center gap-1"
          >
            <RefreshIcon className="w-5 h-5 text-ablue" />
            <span className="text-xs text-l3">Yeni Oyun</span>
          </button>
          <button
            onClick={finishGame}
            className="bg-[var(--danger-bg)] hover:opacity-90 active:scale-[0.97] border border-[var(--danger-border)] text-ared py-3.5 rounded-xl text-sm font-medium transition-all touch-manipulation flex flex-col items-center gap-1"
          >
            <FlagIcon />
            <span className="text-xs">Bitir</span>
          </button>
        </div>
      </div>

      {/* ---- MODALS ---- */}

      {/* Round Detail Modal */}
      {selectedRoundDetails !== null && (() => {
        const detail = getRoundDetail(selectedRoundDetails);
        return (
          <div className={modalBase} onClick={() => setSelectedRoundDetails(null)}>
            <div className={`${modalCard} max-w-lg`} onClick={e => e.stopPropagation()}>
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-l1 font-semibold">Round {selectedRoundDetails + 1} — Detay</h3>
                  <button onClick={() => setSelectedRoundDetails(null)} className="w-8 h-8 rounded-lg bg-s2 border border-sep text-l3 flex items-center justify-center transition-colors active:scale-[0.95] touch-manipulation">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                {detail ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-7 gap-1 px-2 py-1.5 bg-s2 rounded-lg text-[10px] text-l3 text-center">
                      <div>İsim</div><div>Puan</div><div>B.Ceza</div><div>T.Ceza</div><div>Okey</div><div>Bitti</div><div>Toplam</div>
                    </div>
                    {detail.players.map((player, index) => {
                      return (
                        <div key={index} className="grid grid-cols-7 gap-1 px-2 py-2.5 rounded-lg text-xs text-center bg-s2">
                          <div className="font-medium truncate text-l2">{player.name}</div>
                          <div className={player.points < 0 ? 'text-agreen' : 'text-l1'}>{player.points || '—'}</div>
                          <div className={player.individualPenalty ? 'text-aorange' : 'text-l4'}>{player.individualPenalty || '—'}</div>
                          <div className={gameData?.gameMode === 'group' && player.teamPenalty ? 'text-l1' : 'text-l4'}>{(gameData?.gameMode === 'group' && player.teamPenalty) ? player.teamPenalty : '—'}</div>
                          <div className={player.hasOkey1 || player.hasOkey2 ? 'text-ablue' : 'text-l4'}>{[player.hasOkey1 && '●', player.hasOkey2 && '●'].filter(Boolean).join(' ') || '—'}</div>
                          <div className={player.finished ? 'text-agreen' : 'text-l4'}>{player.finished ? '✓' : '—'}</div>
                          <div className={`font-bold ${player.total < 0 ? 'text-agreen' : 'text-l1'}`}>{player.total}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-l3 text-center py-8">Detay bulunamadı</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Round Modal */}
      {isEditMode && editRoundData && (
        <div className={modalBase}>
          <div className={`${modalCard} max-w-lg`}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-l1 font-semibold">Round {editRoundData.round} — Düzenle</h3>
                <div className="flex gap-2">
                  <button onClick={saveRoundEdit} className="bg-ablue active:scale-[0.96] text-white font-bold px-4 py-2 rounded-xl text-sm transition-all touch-manipulation">
                    Kaydet
                  </button>
                  <button onClick={cancelRoundEdit} className="w-9 h-9 rounded-xl bg-s2 border border-sep text-l3 flex items-center justify-center transition-colors active:scale-[0.95] touch-manipulation">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-6 gap-1 px-2 py-1.5 bg-s2 rounded-lg text-[10px] text-l3 text-center">
                  <div>İsim</div><div>Puan</div><div>Ceza</div><div>Okey</div><div>Bitti</div><div>Toplam</div>
                </div>
                {editRoundData.players.map((player, index) => {
                  const inputCls = 'w-full px-1 py-1.5 bg-s2 border border-sep rounded-lg text-l1 text-center text-xs';
                  return (
                    <div key={index} className="grid grid-cols-6 gap-1 px-2 py-2 rounded-lg bg-s2">
                      <div className="text-xs font-medium self-center truncate text-l2">{player.name}</div>
                      <div>
                        <input type="text" inputMode="decimal" pattern="^-?\d*$" value={editInputValues.points[index]}
                          onChange={(e) => {
                            let value = e.target.value;
                            if (!/^-?\d*$/.test(value) || value.split('-').length > 2 || (value.includes('-') && value.indexOf('-') !== 0)) return;
                            const newIV = { ...editInputValues }; newIV.points[index] = value; setEditInputValues(newIV);
                            if (value === '' || value === '-') updateEditPlayerData(index, 'points', 0);
                            else { const n = parseInt(value); if (!isNaN(n) && n >= -999 && n <= 999) updateEditPlayerData(index, 'points', n); }
                          }}
                          className={inputCls} placeholder="0" maxLength={4} />
                      </div>
                      <div>
                        <input type="text" inputMode="numeric" pattern="^\d*$" value={editInputValues.penalty[index]}
                          onChange={(e) => {
                            let value = e.target.value;
                            if (!/^\d*$/.test(value)) return;
                            const newIV = { ...editInputValues }; newIV.penalty[index] = value; setEditInputValues(newIV);
                            if (value === '') updateEditPlayerData(index, 'penalty', 0);
                            else { const n = parseInt(value); if (!isNaN(n) && n >= 0 && n <= 9999) updateEditPlayerData(index, 'penalty', n); }
                          }}
                          className={inputCls} placeholder="0" maxLength={4} />
                      </div>
                      <div className="flex justify-center items-center gap-0.5">
                        <button onClick={() => updateEditPlayerData(index, 'hasOkey1', !player.hasOkey1)}
                          className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors touch-manipulation ${player.hasOkey1 ? 'bg-ablue text-white' : 'bg-s2 border border-sep text-l3'}`}>
                          <svg className="w-2 h-2" viewBox="0 0 12 12" fill="currentColor"><circle cx="6" cy="6" r="5" /></svg>
                        </button>
                        <button onClick={() => updateEditPlayerData(index, 'hasOkey2', !player.hasOkey2)}
                          className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors touch-manipulation ${player.hasOkey2 ? 'bg-ablue text-white' : 'bg-s2 border border-sep text-l3'}`}>
                          <svg className="w-2 h-2" viewBox="0 0 12 12" fill="currentColor"><circle cx="6" cy="6" r="5" /></svg>
                        </button>
                      </div>
                      <div className="flex justify-center items-center">
                        <button onClick={() => updateEditPlayerData(index, 'finished', !player.finished)}
                          className={`w-7 h-6 rounded-md text-[10px] font-bold transition-colors touch-manipulation ${player.finished ? 'bg-[var(--success-bg)] border border-[var(--success-border)] text-agreen' : 'bg-s2 border border-sep text-l4'}`}>
                          {player.finished ? '✓' : '—'}
                        </button>
                      </div>
                      <div className={`text-sm font-bold text-center self-center ${player.total < 0 ? 'text-agreen' : 'text-l1'}`}>{player.total}</div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 px-3 py-2 bg-s2 border border-sep rounded-xl">
                <p className="text-l3 text-xs text-center">Toplam = Puan + Ceza − Bitirme (−101)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className={modalBase}>
          <div className={modalCard}>
            <div className="p-6 text-center">
              <div className="flex justify-center mb-3">
                {confirmAction === 'finish'
                  ? <FlagIcon className="w-10 h-10 text-ared" />
                  : <RefreshIcon className="w-10 h-10 text-ablue" />}
              </div>
              <h2 className="text-l1 font-bold text-lg mb-2">
                {confirmAction === 'finish' ? 'Oyunu Bitir' : 'Yeni Oyun'}
              </h2>
              <p className="text-l3 text-sm mb-5 leading-relaxed">
                {confirmAction === 'finish'
                  ? 'Oyunu bitirip sonuç ekranına geçmek istediğinizden emin misiniz?'
                  : 'Mevcut oyun verileri silinecek. Devam etmek istiyor musunuz?'}
              </p>
              <div className="bg-[var(--warn-bg)] border border-[var(--warn-border)] rounded-xl px-4 py-2.5 mb-5">
                <span className="text-ayellow text-xs">
                  {confirmAction === 'finish' ? 'Bu işlem geri alınamaz!' : 'Tüm round verileri kaybolacak!'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setShowConfirmModal(false); setConfirmAction(null); }}
                  className="bg-s2 border border-sep text-l2 py-3 rounded-xl font-medium text-sm transition-colors active:scale-[0.97] touch-manipulation">
                  İptal
                </button>
                <button onClick={handleConfirmAction}
                  className={`py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97] touch-manipulation ${
                    confirmAction === 'finish'
                      ? 'bg-[var(--danger-bg)] border border-[var(--danger-border)] text-ared hover:opacity-90'
                      : 'bg-ablue hover:opacity-90 text-white'
                  }`}>
                  {confirmAction === 'finish' ? 'Evet, Bitir' : 'Evet, Başlat'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Game End Modal */}
      {showGameEndModal && gameEndData && (
        <div className={modalBase}>
          <div className={`${modalCard} max-w-lg`}>
            <div className="p-6">

              {/* Hero */}
              <div className="text-center pb-6">
                <div className="flex justify-center mb-3">
                  {gameEndData.winnerType === 'tie'
                    ? <EqualIcon className="w-12 h-12 text-ablue" />
                    : <TrophyIcon className="w-12 h-12 text-ablue" />}
                </div>
                <p className="text-[10px] text-l3 uppercase tracking-widest mb-2">
                  {gameEndData.winnerType === 'tie' ? 'Berabere' : 'Kazanan'}
                </p>
                <h2 className="text-2xl font-bold text-l1">{gameEndData.winner}</h2>
                {gameEndData.winnerType === 'single' && gameEndData.winnerScore !== undefined && (
                  <p className="text-l3 text-sm mt-1">{gameEndData.winnerScore} puan</p>
                )}
                {gameEndData.winnerType !== 'tie' && gameEndData.scoreFark !== undefined && (
                  <p className="text-xs mt-2 text-l4">
                    <span className="uppercase tracking-widest">Fark</span>{' '}
                    <span className="text-l2 font-semibold">{gameEndData.scoreFark}</span>{' '}
                    <span>puan</span>
                  </p>
                )}
              </div>

              {/* Grup skorları */}
              {gameEndData.isGroup && (
                <div className="grid grid-cols-2 gap-2 mb-6">
                  <div className={`text-center px-4 py-3 rounded-2xl bg-s2 ${gameEndData.winnerType === 'group1' ? 'border-2 border-ablue' : 'border border-sep'}`}>
                    <p className="text-[11px] font-semibold text-l2 uppercase tracking-widest mb-1 truncate">{gameEndData.groupScores.group1.name}</p>
                    <p className="text-2xl font-bold text-l1">
                      {gameEndData.groupScores.group1.total}
                    </p>
                  </div>
                  <div className={`text-center px-4 py-3 rounded-2xl bg-s2 ${gameEndData.winnerType === 'group2' ? 'border-2 border-ablue' : 'border border-sep'}`}>
                    <p className="text-[11px] font-semibold text-l2 uppercase tracking-widest mb-1 truncate">{gameEndData.groupScores.group2.name}</p>
                    <p className="text-2xl font-bold text-l1">
                      {gameEndData.groupScores.group2.total}
                    </p>
                  </div>
                </div>
              )}

              {/* Oyuncu tablosu — transposed */}
              {(() => {
                const allPlayers = gameEndData.playersWithStats || gameEndData.rankings || [];
                const cols = `3rem repeat(${allPlayers.length}, 1fr)`;
                const totalRounds = players[0]?.scores.length || 0;
                const rows = [
                  { label: 'Puan',  get: (p: any) => p.score,                                                            color: (v: any) => v < 0 ? 'text-agreen' : 'text-l1' },
                  { label: '*RBP',  get: (p: any) => totalRounds > 0 ? (p.score / totalRounds).toFixed(1) : '—',         color: (v: any) => parseFloat(v) < 0 ? 'text-agreen' : 'text-l1' },
                  { label: 'Okey',  get: (p: any) => p.stats?.totalOkey || 0,                                            color: (v: any) => v > 0 ? 'text-l1' : 'text-l4' },
                  { label: 'Bitiş', get: (p: any) => (p.stats?.totalFinish || 0) + (p.stats?.totalHandFinish || 0),      color: (v: any) => v > 0 ? 'text-agreen' : 'text-l4' },
                  { label: 'Ceza',  get: (p: any) => p.stats?.totalIndividualPenalty || 0,                               color: (v: any) => v > 0 ? 'text-l1' : 'text-l4' },
                ];
                return (
                  <div className="rounded-2xl overflow-hidden border border-sep mb-5">
                    {/* Başlık: oyuncu isimleri */}
                    <div className="grid bg-s2 px-4 py-2 gap-1" style={{gridTemplateColumns: cols}}>
                      <div />
                      {allPlayers.map((p: any, i: number) => (
                        <div key={i} className="text-center min-w-0">
                          <div className="text-[11px] font-semibold text-l3 mb-0.5">{i + 1}.</div>
                          <div className="text-[10px] font-semibold text-l2 truncate">{p.name}</div>
                        </div>
                      ))}
                    </div>
                    {/* Stat satırları */}
                    {rows.map((row, ri) => (
                      <div key={ri} className="grid border-t border-sep px-4 py-3 gap-1 items-center" style={{gridTemplateColumns: cols}}>
                        <div className="text-[10px] text-l3 uppercase tracking-wide">{row.label}</div>
                        {allPlayers.map((p: any, i: number) => {
                          const val = row.get(p);
                          return (
                            <div key={i} className={`text-sm font-semibold text-center min-w-0 ${row.color(val)}`}>{val}</div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })()}

              <p className="text-[10px] text-l4 -mt-3 mb-5">* RBP: Round Başına Puan</p>

              {/* Butonlar */}
              <div className="space-y-2">
                <button
                  onClick={() => { setShowGameEndModal(false); startNewGame(); }}
                  className="w-full bg-ablue hover:opacity-90 active:scale-[0.98] text-white font-bold py-3.5 rounded-xl text-sm transition-all touch-manipulation"
                >
                  Yeni Oyun Başlat
                </button>
                <button
                  onClick={() => {
                    setShowGameEndModal(false);
                    localStorage.removeItem('roundDetails');
                    localStorage.removeItem('currentGameId');
                    router.push('/');
                  }}
                  className="w-full bg-s2 border border-sep text-l3 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.97] touch-manipulation"
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
      <div className="min-h-screen bg-s0 flex items-center justify-center">
        <div className="text-l3 text-sm">Yükleniyor...</div>
      </div>
    }>
      <GamePageContent />
    </Suspense>
  );
}
