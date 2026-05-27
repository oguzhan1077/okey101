'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useVenue } from '@/context/VenueContext';

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
      const uniqueDetails = storedDetails.filter((d: RoundDetail, i: number, arr: RoundDetail[]) =>
        arr.findIndex((x: RoundDetail) => x.round === d.round) === i
      );
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

  const getTotalScore = useCallback((playerIndex: number) => {
    let baseScore = players[playerIndex]?.scores.reduce((sum, score) => sum + score, 0) || 0;
    if (gameData?.gameMode === 'group') {
      const teammateIndex = getTeammateIndex(playerIndex);
      roundDetails.forEach(round => {
        const player = round.players[playerIndex];
        const teammate = teammateIndex !== -1 ? round.players[teammateIndex] : null;
        if (player && teammate) {
          baseScore += player.teamPenalty / 2 + teammate.teamPenalty / 2;
          baseScore -= player.teamPenalty;
        }
      });
    }
    return baseScore;
  }, [players, gameData?.gameMode, roundDetails]);

  const getTeammateIndex = useCallback((playerIndex: number) => {
    if (!gameData || gameData.gameMode !== 'group') return -1;
    if (playerIndex === 0) return 2;
    if (playerIndex === 1) return 3;
    if (playerIndex === 2) return 0;
    if (playerIndex === 3) return 1;
    return -1;
  }, [gameData?.gameMode]);

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
    let endData: any = { isGroup: !!groupScores, playersWithStats: playersWithStats.sort((a, b) => a.score - b.score) };
    if (groupScores) {
      endData.groupScores = groupScores;
      if (groupScores.group1.total < groupScores.group2.total) { endData.winner = groupScores.group1.name; endData.winnerType = 'group1'; }
      else if (groupScores.group2.total < groupScores.group1.total) { endData.winner = groupScores.group2.name; endData.winnerType = 'group2'; }
      else { endData.winner = 'Berabere'; endData.winnerType = 'tie'; }
    } else {
      endData.rankings = playersWithStats.map((player, index) => ({ ...player, rank: index + 1 }));
      endData.winner = playersWithStats[0].name;
      endData.winnerType = 'single';
      endData.winnerScore = playersWithStats[0].score;
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

  const glassCard = 'bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] rounded-2xl';
  const modalBase = 'fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50';
  const modalCard = 'bg-[#131318] border border-white/[0.10] rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto';

  if (!gameData) {
    return (
      <div className="min-h-screen bg-[#0f0f14] flex items-center justify-center">
        <div className="text-white/40 text-sm">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f14]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-[#0f0f14]/90 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-base font-bold text-white">101 Oyunu</h1>
          {venue && (
            <div className="flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.07] rounded-full px-3 py-1">
              {venue.logo_url && <img src={venue.logo_url} alt={venue.name} className="h-3.5 w-3.5 object-contain" />}
              <span className="text-white/50 text-xs">{venue.name}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
        {/* Player Cards */}
        <div className={`${glassCard} p-3`}>
          <div className="grid grid-cols-4 gap-2">
            {players.map((player, index) => {
              const isGroup1 = index === 0 || index === 2;
              return (
                <div
                  key={index}
                  className={`rounded-xl p-2.5 border text-center ${
                    gameData.gameMode === 'group'
                      ? isGroup1 ? 'bg-sky-500/[0.07] border-sky-500/[0.18]' : 'bg-violet-500/[0.07] border-violet-500/[0.18]'
                      : 'bg-white/[0.03] border-white/[0.07]'
                  }`}
                >
                  {gameData.dealerIndex === index && (
                    <div className="flex justify-center mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" title="Dağıtan" />
                    </div>
                  )}
                  <div
                    className={`font-semibold text-xs leading-tight ${
                      gameData.gameMode === 'group' ? (isGroup1 ? 'text-sky-300' : 'text-violet-300') : 'text-white/90'
                    }`}
                    style={{wordBreak: 'break-word'}}
                  >
                    {player.name}
                  </div>
                  {gameData.gameMode === 'group' && (
                    <div className={`text-[10px] mt-0.5 truncate ${isGroup1 ? 'text-sky-400/50' : 'text-violet-400/50'}`}>
                      {isGroup1 ? gameData.group1Name : gameData.group2Name}
                    </div>
                  )}
                  {showCalculation && (
                    <div className="mt-2 pt-2 border-t border-white/[0.07]">
                      <div className={`text-sm font-bold ${
                        getTotalScore(index) > 0 ? 'text-red-400' : getTotalScore(index) < 0 ? 'text-emerald-400' : 'text-white/40'
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
          {showCalculation && gameData.gameMode === 'group' && (() => {
            const g = getGroupScores()!;
            return (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="bg-sky-500/[0.07] border border-sky-500/[0.18] rounded-xl px-3 py-2.5 text-center">
                  <div className="text-sky-300/70 text-[11px] font-medium truncate">{g.group1.name}</div>
                  <div className={`text-xl font-bold mt-0.5 ${g.group1.total > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{g.group1.total}</div>
                </div>
                <div className="bg-violet-500/[0.07] border border-violet-500/[0.18] rounded-xl px-3 py-2.5 text-center">
                  <div className="text-violet-300/70 text-[11px] font-medium truncate">{g.group2.name}</div>
                  <div className={`text-xl font-bold mt-0.5 ${g.group2.total > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{g.group2.total}</div>
                </div>
              </div>
            );
          })()}

          {/* Score difference */}
          {showCalculation && (() => {
            const diff = getScoreDifferences();
            if (!diff) return null;
            return (
              <div className="mt-2 flex items-center justify-between bg-white/[0.03] rounded-xl px-4 py-2.5 text-sm">
                <span className="text-white/40 text-xs">Önde</span>
                <span className="text-amber-400 font-semibold">{diff.leader}</span>
                <span className="text-white/40 text-xs">Fark</span>
                <span className="text-sky-400 font-semibold">{diff.difference} puan</span>
              </div>
            );
          })()}
        </div>

        {/* Round History */}
        <div className={`${glassCard} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <h2 className="text-white/60 text-xs font-medium uppercase tracking-wide">Round Geçmişi</h2>
            <span className="text-white/30 text-xs">{players[0]?.scores.length || 0} round</span>
          </div>

          {players[0]?.scores.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-white/20 text-sm">Henüz round oynanmadı</p>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-6 gap-1 px-3 py-2 bg-white/[0.02]">
                <div className="text-white/25 text-[10px] text-center">#</div>
                {players.map((player, idx) => {
                  const isGroup1 = idx === 0 || idx === 2;
                  return (
                    <div key={idx} className={`text-[10px] text-center font-medium truncate px-0.5 ${
                      gameData.gameMode === 'group' ? (isGroup1 ? 'text-sky-400/50' : 'text-violet-400/50') : 'text-white/35'
                    }`}>
                      {player.name}
                    </div>
                  );
                })}
                <div className="text-white/25 text-[10px] text-center"></div>
              </div>

              {players[0].scores.map((_, roundIndex) => (
                <div key={roundIndex} className="grid grid-cols-6 gap-1 px-3 py-2 border-t border-white/[0.04] hover:bg-white/[0.015] transition-colors">
                  <div className="text-white/40 text-xs text-center self-center">{roundIndex + 1}</div>
                  {players.map((player, playerIndex) => {
                    const score = player.scores[roundIndex];
                    return (
                      <div key={playerIndex} className="text-center self-center">
                        <span className={`text-xs font-bold ${score > 0 ? 'text-red-400' : score < 0 ? 'text-emerald-400' : 'text-white/30'}`}>
                          {score}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => {
                        setSelectedRoundDetails(selectedRoundDetails === roundIndex ? null : roundIndex);
                        setShowCalculation(false);
                        setIsEditMode(false);
                      }}
                      className="w-6 h-6 rounded-md bg-sky-500/15 border border-sky-500/25 text-sky-400 flex items-center justify-center transition-colors active:scale-[0.93] touch-manipulation"
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
                      className="w-6 h-6 rounded-md bg-amber-500/15 border border-amber-500/25 text-amber-400 flex items-center justify-center transition-colors active:scale-[0.93] touch-manipulation"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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
            <span className="text-white/40 text-sm">Sonraki round</span>
            <span className="text-white font-semibold text-sm">Round {currentRound}</span>
          </div>
          <button
            onClick={goToRoundPage}
            className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black font-bold py-4 rounded-xl text-base transition-all shadow-glow-green touch-manipulation"
          >
            + Yeni Round Ekle
          </button>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2 pb-4">
          <button
            onClick={() => { calculateTotals(); setSelectedRoundDetails(null); }}
            className="bg-white/[0.05] hover:bg-white/[0.08] active:scale-[0.97] border border-white/[0.08] text-white/70 py-3.5 rounded-xl text-sm font-medium transition-all touch-manipulation flex flex-col items-center gap-1"
          >
            <span className="text-lg">📊</span>
            <span className="text-xs">Skorlar</span>
          </button>
          <button
            onClick={finishGame}
            className="bg-red-500/15 hover:bg-red-500/25 active:scale-[0.97] border border-red-500/25 text-red-400 py-3.5 rounded-xl text-sm font-medium transition-all touch-manipulation flex flex-col items-center gap-1"
          >
            <span className="text-lg">🏁</span>
            <span className="text-xs">Bitir</span>
          </button>
          <button
            onClick={startNewGame}
            className="bg-white/[0.03] hover:bg-white/[0.06] active:scale-[0.97] border border-white/[0.06] text-white/40 py-3.5 rounded-xl text-sm font-medium transition-all touch-manipulation flex flex-col items-center gap-1"
          >
            <span className="text-lg">🎮</span>
            <span className="text-xs">Yeni Oyun</span>
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
                  <h3 className="text-white font-semibold">Round {selectedRoundDetails + 1} — Detay</h3>
                  <button onClick={() => setSelectedRoundDetails(null)} className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/50 flex items-center justify-center transition-colors active:scale-[0.95] touch-manipulation">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                {detail ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-7 gap-1 px-2 py-1.5 bg-white/[0.03] rounded-lg text-[10px] text-white/40 text-center">
                      <div>İsim</div><div>Puan</div><div>B.Ceza</div><div>T.Ceza</div><div>Okey</div><div>Bitti</div><div>Toplam</div>
                    </div>
                    {detail.players.map((player, index) => {
                      const isGroup1 = index === 0 || index === 2;
                      return (
                        <div key={index} className={`grid grid-cols-7 gap-1 px-2 py-2.5 rounded-lg text-xs text-center ${
                          gameData?.gameMode === 'group' ? (isGroup1 ? 'bg-sky-500/[0.06]' : 'bg-violet-500/[0.06]') : 'bg-white/[0.03]'
                        }`}>
                          <div className={`font-medium truncate ${gameData?.gameMode === 'group' ? (isGroup1 ? 'text-sky-300' : 'text-violet-300') : 'text-white/80'}`}>{player.name}</div>
                          <div className={player.points > 0 ? 'text-red-400' : player.points < 0 ? 'text-emerald-400' : 'text-white/30'}>{player.points || '—'}</div>
                          <div className={player.individualPenalty ? 'text-orange-400' : 'text-white/20'}>{player.individualPenalty || '—'}</div>
                          <div className={gameData?.gameMode === 'group' && player.teamPenalty ? 'text-red-400' : 'text-white/20'}>{(gameData?.gameMode === 'group' && player.teamPenalty) ? player.teamPenalty : '—'}</div>
                          <div className={player.hasOkey1 || player.hasOkey2 ? 'text-amber-400' : 'text-white/20'}>{[player.hasOkey1 && '⚪', player.hasOkey2 && '⚪'].filter(Boolean).join('') || '—'}</div>
                          <div className={player.finished ? 'text-emerald-400' : 'text-white/20'}>{player.finished ? '✓' : '—'}</div>
                          <div className={`font-bold ${player.total > 0 ? 'text-red-400' : player.total < 0 ? 'text-emerald-400' : 'text-white/40'}`}>{player.total}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-white/30 text-center py-8">Detay bulunamadı</div>
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
                <h3 className="text-white font-semibold">Round {editRoundData.round} — Düzenle</h3>
                <div className="flex gap-2">
                  <button onClick={saveRoundEdit} className="bg-emerald-500 active:scale-[0.96] text-black font-bold px-4 py-2 rounded-xl text-sm transition-all shadow-glow-green touch-manipulation">
                    Kaydet
                  </button>
                  <button onClick={cancelRoundEdit} className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/50 flex items-center justify-center transition-colors active:scale-[0.95] touch-manipulation">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-6 gap-1 px-2 py-1.5 bg-white/[0.03] rounded-lg text-[10px] text-white/40 text-center">
                  <div>İsim</div><div>Puan</div><div>Ceza</div><div>Okey</div><div>Bitti</div><div>Toplam</div>
                </div>
                {editRoundData.players.map((player, index) => {
                  const isGroup1 = index === 0 || index === 2;
                  const inputCls = 'w-full px-1 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-white text-center text-xs';
                  return (
                    <div key={index} className={`grid grid-cols-6 gap-1 px-2 py-2 rounded-lg ${
                      gameData?.gameMode === 'group' ? (isGroup1 ? 'bg-sky-500/[0.06]' : 'bg-violet-500/[0.06]') : 'bg-white/[0.03]'
                    }`}>
                      <div className={`text-xs font-medium self-center truncate ${gameData?.gameMode === 'group' ? (isGroup1 ? 'text-sky-300' : 'text-violet-300') : 'text-white/80'}`}>{player.name}</div>
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
                          className={`w-5 h-5 rounded-full text-[10px] transition-colors touch-manipulation ${player.hasOkey1 ? 'bg-amber-500 text-white' : 'bg-amber-500/10 border border-amber-500/25 text-amber-400'}`}>⚪</button>
                        <button onClick={() => updateEditPlayerData(index, 'hasOkey2', !player.hasOkey2)}
                          className={`w-5 h-5 rounded-full text-[10px] transition-colors touch-manipulation ${player.hasOkey2 ? 'bg-amber-500 text-white' : 'bg-amber-500/10 border border-amber-500/25 text-amber-400'}`}>⚪</button>
                      </div>
                      <div className="flex justify-center items-center">
                        <button onClick={() => updateEditPlayerData(index, 'finished', !player.finished)}
                          className={`w-7 h-6 rounded-md text-[10px] font-bold transition-colors touch-manipulation ${player.finished ? 'bg-emerald-500/30 border border-emerald-500/40 text-emerald-400' : 'bg-white/[0.05] border border-white/[0.08] text-white/30'}`}>
                          {player.finished ? '✓' : '—'}
                        </button>
                      </div>
                      <div className={`text-sm font-bold text-center self-center ${player.total > 0 ? 'text-red-400' : player.total < 0 ? 'text-emerald-400' : 'text-white/40'}`}>{player.total}</div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 px-3 py-2 bg-sky-500/[0.07] border border-sky-500/[0.15] rounded-xl">
                <p className="text-sky-300/70 text-xs text-center">Toplam = Puan + Ceza − Bitirme (−101)</p>
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
              <div className="text-4xl mb-3">{confirmAction === 'finish' ? '🏁' : '🎮'}</div>
              <h2 className="text-white font-bold text-lg mb-2">
                {confirmAction === 'finish' ? 'Oyunu Bitir' : 'Yeni Oyun'}
              </h2>
              <p className="text-white/50 text-sm mb-5 leading-relaxed">
                {confirmAction === 'finish'
                  ? 'Oyunu bitirip sonuç ekranına geçmek istediğinizden emin misiniz?'
                  : 'Mevcut oyun verileri silinecek. Devam etmek istiyor musunuz?'}
              </p>
              <div className="bg-amber-500/[0.08] border border-amber-500/[0.20] rounded-xl px-4 py-2.5 mb-5">
                <span className="text-amber-400/80 text-xs">
                  {confirmAction === 'finish' ? 'Bu işlem geri alınamaz!' : 'Tüm round verileri kaybolacak!'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setShowConfirmModal(false); setConfirmAction(null); }}
                  className="bg-white/[0.05] border border-white/[0.08] text-white/60 py-3 rounded-xl font-medium text-sm transition-colors active:scale-[0.97] touch-manipulation">
                  İptal
                </button>
                <button onClick={handleConfirmAction}
                  className={`py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97] touch-manipulation ${
                    confirmAction === 'finish' ? 'bg-red-500/80 hover:bg-red-500 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-glow-green'
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
              <div className="text-center mb-5">
                <div className="text-4xl mb-2">{gameEndData.winnerType === 'tie' ? '🤝' : '🏆'}</div>
                <h2 className="text-white font-bold text-lg">{gameEndData.winnerType === 'tie' ? 'Berabere!' : 'Oyun Bitti!'}</h2>
              </div>

              <div className="bg-amber-500/[0.10] border border-amber-500/[0.22] rounded-xl px-4 py-3 text-center mb-4">
                <div className="text-amber-300/60 text-xs mb-1">{gameEndData.winnerType === 'tie' ? 'Sonuç' : 'Kazanan'}</div>
                <div className="text-amber-400 font-bold text-lg">{gameEndData.winner}</div>
                {gameEndData.winnerType === 'single' && gameEndData.winnerScore !== undefined && (
                  <div className="text-amber-300/50 text-xs mt-0.5">{gameEndData.winnerScore} puan</div>
                )}
              </div>

              {gameEndData.isGroup && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className={`rounded-xl px-3 py-2.5 text-center border ${gameEndData.winnerType === 'group1' ? 'bg-emerald-500/[0.08] border-emerald-500/25' : 'bg-white/[0.03] border-white/[0.07]'}`}>
                    <div className="text-sky-300/70 text-xs truncate">{gameEndData.groupScores.group1.name}</div>
                    <div className="text-white font-bold text-xl">{gameEndData.groupScores.group1.total}</div>
                  </div>
                  <div className={`rounded-xl px-3 py-2.5 text-center border ${gameEndData.winnerType === 'group2' ? 'bg-emerald-500/[0.08] border-emerald-500/25' : 'bg-white/[0.03] border-white/[0.07]'}`}>
                    <div className="text-violet-300/70 text-xs truncate">{gameEndData.groupScores.group2.name}</div>
                    <div className="text-white font-bold text-xl">{gameEndData.groupScores.group2.total}</div>
                  </div>
                </div>
              )}

              <div className="rounded-xl overflow-hidden border border-white/[0.06] mb-4">
                <div className={`grid gap-1 px-3 py-2 bg-white/[0.04] text-[10px] text-white/35 text-center ${gameEndData.isGroup ? 'grid-cols-6' : 'grid-cols-5'}`}>
                  <div>Oyuncu</div><div>Puan</div><div>Okey</div><div>Bitti</div><div>B.Ceza</div>
                  {gameEndData.isGroup && <div>T.Ceza</div>}
                </div>
                {(gameEndData.playersWithStats || gameEndData.rankings)?.map((player: any, index: number) => (
                  <div key={index} className={`grid gap-1 px-3 py-2.5 border-t border-white/[0.04] text-xs text-center ${gameEndData.isGroup ? 'grid-cols-6' : 'grid-cols-5'} ${index === 0 ? 'bg-amber-500/[0.07]' : ''}`}>
                    <div className={`font-medium text-center break-words leading-tight ${gameEndData.isGroup ? (player.isGroup1 ? 'text-sky-300' : 'text-violet-300') : 'text-white/80'}`}>
                      {index === 0 ? '🏆 ' : `${index + 1}. `}{player.name}
                    </div>
                    <div className={`self-center ${player.score > 0 ? 'text-red-400' : player.score < 0 ? 'text-emerald-400' : 'text-white/30'}`}>{player.score}</div>
                    <div className={`self-center ${(player.stats?.totalOkey || 0) > 0 ? 'text-amber-400' : 'text-white/20'}`}>{player.stats?.totalOkey || 0}</div>
                    <div className={`self-center ${((player.stats?.totalFinish || 0) + (player.stats?.totalHandFinish || 0)) > 0 ? 'text-emerald-400' : 'text-white/20'}`}>{(player.stats?.totalFinish || 0) + (player.stats?.totalHandFinish || 0)}</div>
                    <div className={`self-center ${(player.stats?.totalIndividualPenalty || 0) > 0 ? 'text-orange-400' : 'text-white/20'}`}>{player.stats?.totalIndividualPenalty || 0}</div>
                    {gameEndData.isGroup && <div className={`self-center ${(player.stats?.totalTeamPenalty || 0) > 0 ? 'text-red-400' : 'text-white/20'}`}>{player.stats?.totalTeamPenalty || 0}</div>}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => { setShowGameEndModal(false); startNewGame(); }}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black font-bold py-3.5 rounded-xl text-sm transition-all shadow-glow-green touch-manipulation"
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
                  className="w-full bg-white/[0.04] border border-white/[0.07] text-white/40 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.97] touch-manipulation"
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
      <div className="min-h-screen bg-[#0f0f14] flex items-center justify-center">
        <div className="text-white/30 text-sm">Yükleniyor...</div>
      </div>
    }>
      <GamePageContent />
    </Suspense>
  );
}
