'use client';

import { useState, useEffect, Suspense, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ChartIcon, FlagIcon, RefreshIcon, TrophyIcon, EqualIcon, CheckCircleIcon, CircleIcon, TargetIcon } from '@/components/Icons';
import { Logo } from '@/components/Logo';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Player {
  name: string;
  scores: number[];
}

interface PlayerScore {
  points: number;
  penalty: number;
  individualPenalty: number;
  teamPenalty: number;
  hasOkey1: boolean;
  hasOkey2: boolean;
  finished: boolean;
  handFinished: boolean;
}

interface RoundDetail {
  round: number;
  mode?: string;
  group1?: string;
  group2?: string;
  player1?: string;
  player2?: string;
  player3?: string;
  player4?: string;
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

// ── Component ─────────────────────────────────────────────────────────────────

function GamePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  // Aktif görünüm: skor tablosu veya round girişi
  const [view, setView] = useState<'scoreboard' | 'round'>('scoreboard');

  // Skor tablosu state
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
  const [editInputValues, setEditInputValues] = useState<{ points: string[]; penalty: string[] }>({
    points: ['', '', '', ''],
    penalty: ['', '', '', ''],
  });
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'finish' | 'newGame' | null>(null);

  // Round girişi state
  const [playerScores, setPlayerScores] = useState<PlayerScore[]>([]);
  const [inputValues, setInputValues] = useState<string[]>(['', '', '', '']);
  const [isHandFinish, setIsHandFinish] = useState(false);

  // ── Başlangıç ────────────────────────────────────────────────────────────────

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
      searchParams.get('player4'),
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

  // ── Skor tablosu callback'leri ────────────────────────────────────────────────

  const getTeammateIndex = useCallback((playerIndex: number) => {
    if (!gameData || gameData.gameMode !== 'group') return -1;
    if (playerIndex === 0) return 2;
    if (playerIndex === 1) return 3;
    if (playerIndex === 2) return 0;
    if (playerIndex === 3) return 1;
    return -1;
  }, [gameData?.gameMode]);

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
    return {
      group1: { name: gameData.group1Name!, total: getTotalScore(0) + getTotalScore(2) },
      group2: { name: gameData.group2Name!, total: getTotalScore(1) + getTotalScore(3) },
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
      const rankedPlayers = players
        .map((player, index) => ({ name: player.name, score: getTotalScore(index), index }))
        .sort((a, b) => a.score - b.score);
      const difference = rankedPlayers.length > 1 ? Math.abs(rankedPlayers[0].score - rankedPlayers[1].score) : 0;
      return { isGroup: false, difference, leader: rankedPlayers[0].name, scores: rankedPlayers };
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
        const ti = getTeammateIndex(playerIndex);
        if (player.teamPenalty > 0) totalTeamPenalty += player.teamPenalty / 101;
        if (ti !== -1 && round.players[ti]?.teamPenalty > 0) totalTeamPenalty += round.players[ti].teamPenalty / 101;
      } else {
        if (player.teamPenalty > 0) totalTeamPenalty += player.teamPenalty / 101;
      }
    });
    return { totalOkey, totalFinish, totalHandFinish, totalIndividualPenalty, totalTeamPenalty, totalPenalty: totalIndividualPenalty + totalTeamPenalty };
  }, [roundDetails, gameData?.gameMode, getTeammateIndex]);

  const goToRoundView = useCallback(() => {
    if (!gameData) return;
    setShowCalculation(false);
    setIsHandFinish(false);
    setPlayerScores(Array(4).fill(null).map(() => ({
      points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0,
      hasOkey1: false, hasOkey2: false, finished: false, handFinished: false,
    })));
    setInputValues(['', '', '', '']);
    setView('round');
  }, [gameData]);

  const calculateTotals = useCallback(() => { setShowCalculation(true); }, []);

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
        const p = round.players[playerIndex];
        totalScore += p.total;
        if (p.hasOkey1) okeyCount++;
        if (p.hasOkey2) okeyCount++;
        if (p.finished || p.handFinished) finishedCount++;
        if (p.penalty > 0) penaltyCount++;
        individualPenaltyTotal += p.individualPenalty || 0;
        teamPenaltyTotal += p.teamPenalty || 0;
      });
      return { name: playerName, total_score: totalScore, okey_count: okeyCount, penalty_count: penaltyCount, finished_count: finishedCount, individual_penalty: individualPenaltyTotal, team_penalty: teamPenaltyTotal };
    });
    let totalOkeys = 0, totalPenalties = 0, totalFinishedHands = 0, highestRoundScore = 0, lowestRoundScore = Infinity;
    rounds.forEach(round => {
      round.players.forEach(p => {
        if (p.hasOkey1) totalOkeys++;
        if (p.hasOkey2) totalOkeys++;
        if (p.penalty > 0) totalPenalties++;
        if (p.finished || p.handFinished) totalFinishedHands++;
        if (p.total > highestRoundScore) highestRoundScore = p.total;
        if (p.total < lowestRoundScore) lowestRoundScore = p.total;
      });
    });
    if (lowestRoundScore === Infinity) lowestRoundScore = 0;
    const team1TotalScore = game.gameMode === 'group' ? playerStats[0].total_score + playerStats[2].total_score : 0;
    const team2TotalScore = game.gameMode === 'group' ? playerStats[1].total_score + playerStats[3].total_score : 0;
    return { players: playerStats, total_okeys: totalOkeys, total_penalties: totalPenalties, total_finished_hands: totalFinishedHands, highest_round_score: highestRoundScore, lowest_round_score: lowestRoundScore, team1_total_score: team1TotalScore, team2_total_score: team2TotalScore };
  };

  const executeFinishGame = async () => {
    const groupScores = getGroupScores();
    const playersWithStats = players.map((player, index) => ({
      name: player.name, score: getTotalScore(index), originalIndex: index, stats: getPlayerStats(index),
      isGroup1: gameData?.gameMode === 'group' && (index === 0 || index === 2),
      isGroup2: gameData?.gameMode === 'group' && (index === 1 || index === 3),
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
        if (user) { requestBody.game_statistics = gameStats; requestBody.user_won = false; }
        await fetch(`/api/games/${gameId}/finish`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        localStorage.removeItem('currentGameId');
      }
    } catch (error) { console.error('Oyun bitirme kaydı hatası:', error); }
    setGameEndData(endData);
    setShowGameEndModal(true);
    setShowCalculation(false);
  };

  const executeNewGame = () => {
    localStorage.removeItem('roundDetails');
    localStorage.removeItem('currentGameId');
    router.push('/');
  };

  const getRoundDetail = (roundIndex: number) => roundDetails.find(d => d.round === roundIndex + 1);

  const startEditRound = (roundIndex: number) => {
    const detail = getRoundDetail(roundIndex);
    if (detail) {
      setEditRoundData(JSON.parse(JSON.stringify(detail)));
      setEditInputValues({
        points: detail.players.map(p => p.points === 0 ? '' : p.points.toString()),
        penalty: detail.players.map(p => p.penalty === 0 ? '' : p.penalty.toString()),
      });
      setIsEditMode(true);
    }
  };

  const saveRoundEdit = () => {
    if (!editRoundData) return;
    const updatedDetails = roundDetails.map(d => d.round === editRoundData.round ? editRoundData : d);
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
        const up = { ...player, [field]: value };
        let total = up.points + up.penalty;
        if (up.finished && !up.handFinished) total -= 101;
        up.total = total;
        return up;
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

  // ── Round girişi callback'leri ────────────────────────────────────────────────

  const updatePlayerScore = useCallback((playerIndex: number, field: keyof PlayerScore, value: any) => {
    setPlayerScores(prev => prev.map((score, index) => index === playerIndex ? { ...score, [field]: value } : score));
  }, []);

  const addPenalty = useCallback((playerIndex: number, type: 'individual' | 'team') => {
    if (!gameData) return;
    const isGroup = gameData.gameMode === 'group';
    setPlayerScores(prev => prev.map((score, index) => {
      if (type === 'individual' && index === playerIndex) {
        const n = { ...score, individualPenalty: score.individualPenalty + 101 };
        n.penalty = n.individualPenalty + n.teamPenalty; return n;
      } else if (type === 'team' && isGroup) {
        const isTeam1 = playerIndex === 0 || playerIndex === 2;
        if ((index === 0 || index === 2) === isTeam1) {
          const n = { ...score, teamPenalty: score.teamPenalty + 50.5 };
          n.penalty = n.individualPenalty + n.teamPenalty; return n;
        }
      }
      return score;
    }));
  }, [gameData?.gameMode]);

  const removePenalty = useCallback((playerIndex: number, type: 'individual' | 'team') => {
    if (!gameData) return;
    const isGroup = gameData.gameMode === 'group';
    setPlayerScores(prev => prev.map((score, index) => {
      if (type === 'individual' && index === playerIndex) {
        const n = { ...score, individualPenalty: Math.max(0, score.individualPenalty - 101) };
        n.penalty = n.individualPenalty + n.teamPenalty; return n;
      } else if (type === 'team' && isGroup) {
        const isTeam1 = playerIndex === 0 || playerIndex === 2;
        if ((index === 0 || index === 2) === isTeam1) {
          const n = { ...score, teamPenalty: Math.max(0, score.teamPenalty - 50.5) };
          n.penalty = n.individualPenalty + n.teamPenalty; return n;
        }
      }
      return score;
    }));
  }, [gameData?.gameMode]);

  const toggleOkey = useCallback((playerIndex: number, okeyNumber: 1 | 2) => {
    const okeyField = okeyNumber === 1 ? 'hasOkey1' : 'hasOkey2';
    setPlayerScores(prev => prev.map((score, index) => {
      if (index === playerIndex) return { ...score, [okeyField]: !score[okeyField] };
      return { ...score, [okeyField]: false };
    }));
  }, []);

  const toggleFinished = useCallback((playerIndex: number) => {
    const wasFinished = playerScores[playerIndex].finished;
    const newFinished = !wasFinished;
    const ti = getTeammateIndex(playerIndex);
    const isGroup = gameData?.gameMode === 'group';

    if (isHandFinish) {
      if (newFinished) {
        // Elden bitirme uygula
        setPlayerScores(prev => prev.map((score, index) => {
          const base = { ...score, points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0, finished: false, handFinished: false };
          if (isGroup) {
            if (index === playerIndex) return { ...base, points: -202, handFinished: true, finished: true };
            if (index === ti) return { ...base, points: 0 };
            return { ...base, points: 202, individualPenalty: 202, penalty: 202 };
          }
          if (index === playerIndex) return { ...base, points: -202, handFinished: true, finished: true };
          return { ...base, points: 202, individualPenalty: 202, penalty: 202 };
        }));
        const newIV = ['', '', '', ''];
        newIV[playerIndex] = '-202';
        if (isGroup) {
          if (ti !== -1) newIV[ti] = '0';
          [0, 1, 2, 3].forEach(i => { if (i !== playerIndex && i !== ti) newIV[i] = '202'; });
        } else {
          [0, 1, 2, 3].forEach(i => { if (i !== playerIndex) newIV[i] = '202'; });
        }
        setInputValues(newIV);
      } else {
        // Elden bitirmeyi geri al
        setPlayerScores(prev => prev.map(score => ({
          ...score, points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0, finished: false, handFinished: false,
        })));
        setInputValues(['', '', '', '']);
      }
    } else {
      // Normal bitirme
      setPlayerScores(prev => {
        const newScores = prev.map((score, index) => {
          if (index === playerIndex) return { ...score, finished: newFinished, handFinished: false, points: newFinished ? 0 : score.points };
          if (!wasFinished) return { ...score, finished: false, handFinished: false };
          return score;
        });
        if (newFinished && isGroup && ti !== -1) newScores[ti] = { ...newScores[ti], points: 0 };
        return newScores;
      });
      if (newFinished) {
        const newIV = [...inputValues];
        newIV[playerIndex] = '';
        if (isGroup && ti !== -1) newIV[ti] = '';
        setInputValues(newIV);
      }
    }
  }, [playerScores, gameData?.gameMode, getTeammateIndex, inputValues, isHandFinish]);

  const toggleIsHandFinish = useCallback(() => {
    const newIsHandFinish = !isHandFinish;
    const finisherIndex = playerScores.findIndex(s => s.finished);
    const ti = getTeammateIndex(finisherIndex);
    const isGroup = gameData?.gameMode === 'group';

    if (finisherIndex !== -1) {
      if (newIsHandFinish) {
        // Normal → Elden: mevcut bitireni elden kurallarıyla yeniden uygula
        setPlayerScores(prev => prev.map((score, index) => {
          const base = { ...score, points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0, finished: false, handFinished: false };
          if (isGroup) {
            if (index === finisherIndex) return { ...base, points: -202, handFinished: true, finished: true };
            if (index === ti) return { ...base, points: 0 };
            return { ...base, points: 202, individualPenalty: 202, penalty: 202 };
          }
          if (index === finisherIndex) return { ...base, points: -202, handFinished: true, finished: true };
          return { ...base, points: 202, individualPenalty: 202, penalty: 202 };
        }));
        const newIV = ['', '', '', ''];
        newIV[finisherIndex] = '-202';
        if (isGroup) {
          if (ti !== -1) newIV[ti] = '0';
          [0, 1, 2, 3].forEach(i => { if (i !== finisherIndex && i !== ti) newIV[i] = '202'; });
        } else {
          [0, 1, 2, 3].forEach(i => { if (i !== finisherIndex) newIV[i] = '202'; });
        }
        setInputValues(newIV);
      } else {
        // Elden → Normal: mevcut bitireni normal kurallarla yeniden uygula
        setPlayerScores(prev => prev.map((score, index) => {
          if (index === finisherIndex)
            return { ...score, points: 0, handFinished: false, finished: true };
          return { ...score, points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0, finished: false, handFinished: false };
        }));
        setInputValues(['', '', '', '']);
      }
    }

    setIsHandFinish(newIsHandFinish);
  }, [isHandFinish, playerScores, gameData?.gameMode, getTeammateIndex]);

  const isPointInputDisabled = useCallback((playerIndex: number) => {
    if (playerScores[playerIndex]?.finished) return true;
    if (!gameData || gameData.gameMode !== 'group') return false;
    const ti = getTeammateIndex(playerIndex);
    return ti !== -1 ? playerScores[ti]?.finished || false : false;
  }, [gameData?.gameMode, getTeammateIndex, playerScores]);

  const getTotal = useCallback((playerIndex: number) => {
    const score = playerScores[playerIndex];
    if (!score) return 0;
    let total = score.points + score.penalty;
    if (score.handFinished) return total;
    if (score.finished && !score.handFinished) total -= 101;
    return total;
  }, [playerScores]);

  const handlePointChange = useCallback((playerIndex: number, value: string) => {
    if (!/^-?\d*$/.test(value) || value.split('-').length > 2 || (value.includes('-') && value.indexOf('-') !== 0)) return;
    const newIV = [...inputValues]; newIV[playerIndex] = value; setInputValues(newIV);
    if (value === '' || value === '-') updatePlayerScore(playerIndex, 'points', 0);
    else { const n = parseInt(value); if (!isNaN(n) && n >= -999 && n <= 999) updatePlayerScore(playerIndex, 'points', n); }
  }, [inputValues, updatePlayerScore]);

  const handleSubmit = useCallback(() => {
    if (!gameData) return;

    const newRoundDetail: RoundDetail = {
      round: currentRound,
      mode: gameData.gameMode,
      group1: gameData.group1Name,
      group2: gameData.group2Name,
      player1: gameData.players[0], player2: gameData.players[1],
      player3: gameData.players[2], player4: gameData.players[3],
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
        total: getTotal(index),
      })),
    };

    const updatedDetails = [...roundDetails, newRoundDetail];
    setRoundDetails(updatedDetails);
    localStorage.setItem('roundDetails', JSON.stringify(updatedDetails));

    setPlayers(prev => prev.map((player, index) => ({
      ...player,
      scores: [...player.scores, getTotal(index)],
    })));

    const nextDealer = (gameData.dealerIndex + 1) % gameData.players.length;
    setGameData({ ...gameData, dealerIndex: nextDealer });
    setCurrentRound(prev => prev + 1);

    const gameId = localStorage.getItem('currentGameId');
    if (gameId) {
      fetch(`/api/games/${gameId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_rounds: currentRound }),
      }).catch((error) => console.error('Round kaydetme hatası:', error));
    }

    setView('scoreboard');
  }, [gameData, playerScores, getTotal, roundDetails, currentRound]);

  // ── Paylaşılan stiller ────────────────────────────────────────────────────────

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

  // ── Round girişi görünümü ─────────────────────────────────────────────────────

  if (view === 'round') {
    const rowGrid = isGroupMode ? 'relative grid grid-cols-4 gap-1.5' : 'grid grid-cols-4 gap-2';
    const Sep = () => isGroupMode
      ? <div className="absolute inset-y-0 left-1/2 w-px bg-sep -translate-x-px pointer-events-none" />
      : null;

    return (
      <div className="min-h-screen bg-s0 pb-24">
        <div className="sticky top-0 z-10 bg-s0h backdrop-blur-md border-b border-sep">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setView('scoreboard')}
              className="w-9 h-9 rounded-xl bg-s2 border border-sep text-l2 flex items-center justify-center transition-colors active:scale-[0.94] touch-manipulation flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="flex-1 text-center">
              <h1 className="text-l1 font-bold text-base">Round {currentRound}</h1>
            </div>
            <ThemeToggle />
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
          <div className={`${glassCard} overflow-hidden`}>
            {isGroupMode && (
              <div className="grid grid-cols-2 px-3 pt-3 pb-1">
                <p className="text-[10px] font-semibold text-l3 text-center uppercase tracking-widest">{gameData.group1Name}</p>
                <p className="text-[10px] font-semibold text-l3 text-center uppercase tracking-widest">{gameData.group2Name}</p>
              </div>
            )}

            <div className={`${rowGrid} px-3 ${isGroupMode ? 'pt-1' : 'pt-3'} pb-2`}>
              <Sep />
              {displayOrder.map((pi) => (
                <div key={pi} className={`rounded-lg px-1 py-2 text-center bg-s2 ${gameData.dealerIndex === pi ? 'border-2 border-ablue' : 'border border-sep'}`}>
                  <div className="text-[11px] font-semibold leading-tight text-l1" style={{ wordBreak: 'break-word' }}>{gameData.players[pi]}</div>
                </div>
              ))}
            </div>

            <div className="px-3 pb-3 space-y-4">
              {/* Puan */}
              <div>
                <div className="text-l3 text-xs font-medium mb-2">Puan</div>
                <div className={rowGrid}>
                  <Sep />
                  {displayOrder.map((pi) => {
                    const isDisabled = isPointInputDisabled(pi);
                    return (
                      <input
                        key={pi}
                        type="text" inputMode="decimal" pattern="^-?\d*$"
                        value={isDisabled ? '0' : inputValues[pi]}
                        disabled={isDisabled}
                        onChange={(e) => { if (!isDisabled) handlePointChange(pi, e.target.value); }}
                        className={`w-full px-1 py-3 border rounded-xl text-center text-sm font-semibold transition-colors ${isDisabled ? 'bg-s2 border-sep text-l4 cursor-not-allowed' : 'bg-s2 border-sep text-l1'}`}
                        placeholder="0" maxLength={4}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Bireysel Ceza */}
              <div>
                <div className="text-l3 text-xs font-medium mb-2">Bireysel Ceza</div>
                <div className={rowGrid}>
                  <Sep />
                  {displayOrder.map((pi) => (
                    <div key={pi} className="flex items-center justify-center gap-1">
                      <button onClick={() => removePenalty(pi, 'individual')} disabled={playerScores[pi]?.individualPenalty === 0}
                        className="w-7 h-7 rounded-full bg-s2 border border-sep text-l2 flex items-center justify-center text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-[0.93] touch-manipulation">−</button>
                      <div className={`text-xs min-w-[22px] text-center ${playerScores[pi]?.individualPenalty ? 'text-ablue font-bold' : 'text-l3 font-semibold'}`}>
                        {playerScores[pi]?.individualPenalty || 0}
                      </div>
                      <button onClick={() => addPenalty(pi, 'individual')}
                        className="w-7 h-7 rounded-full bg-s2 border border-sep text-l2 flex items-center justify-center text-sm font-bold transition-colors active:scale-[0.93] touch-manipulation">+</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Takım Cezası */}
              {isGroupMode && (
                <div>
                  <div className="text-l3 text-xs font-medium mb-2">Takım Cezası</div>
                  <div className={rowGrid}>
                    <Sep />
                    {displayOrder.map((pi) => (
                      <div key={pi} className="flex items-center justify-center gap-1">
                        <button onClick={() => removePenalty(pi, 'team')} disabled={playerScores[pi]?.teamPenalty === 0}
                          className="w-7 h-7 rounded-full bg-s2 border border-sep text-l2 flex items-center justify-center text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-[0.93] touch-manipulation">−</button>
                        <div className={`text-xs min-w-[22px] text-center ${playerScores[pi]?.teamPenalty ? 'text-ablue font-bold' : 'text-l3 font-semibold'}`}>
                          {playerScores[pi]?.teamPenalty || 0}
                        </div>
                        <button onClick={() => addPenalty(pi, 'team')}
                          className="w-7 h-7 rounded-full bg-s2 border border-sep text-l2 flex items-center justify-center text-sm font-bold transition-colors active:scale-[0.93] touch-manipulation">+</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Okey */}
              <div>
                <div className="text-l3 text-xs font-medium mb-2">Okey</div>
                <div className={rowGrid}>
                  <Sep />
                  {displayOrder.map((pi) => (
                    <div key={pi} className="flex justify-center gap-1">
                      {([1, 2] as const).map(n => (
                        <button key={n} onClick={() => toggleOkey(pi, n)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-[0.93] touch-manipulation ${(n === 1 ? playerScores[pi]?.hasOkey1 : playerScores[pi]?.hasOkey2) ? 'bg-ablue text-white' : 'bg-s2 border border-sep text-l3'}`}>
                          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><circle cx="6" cy="6" r="5" /></svg>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Toplam */}
              <div>
                <div className="text-l3 text-xs font-medium mb-2">Toplam</div>
                <div className={rowGrid}>
                  <Sep />
                  {displayOrder.map((pi) => {
                    const total = getTotal(pi);
                    return (
                      <div key={pi} className="bg-s2 border border-sep rounded-xl py-2.5 text-center">
                        <span className={`text-base font-bold ${total < 0 ? 'text-agreen' : 'text-l1'}`}>{total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Oyunu Bitiren */}
          <div className={`${glassCard} p-4`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-l2 font-semibold text-sm">Oyunu Bitiren</h3>
                <p className="text-l3 text-xs mt-0.5">
                  {isHandFinish
                    ? `−202 puan · ${isGroupMode ? 'Karşı takıma +404' : 'Diğerlerine +404'}`
                    : '−101 puan · Sadece 1 oyuncu'}
                </p>
              </div>
              <button
                onClick={toggleIsHandFinish}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all touch-manipulation active:scale-[0.95] ${
                  isHandFinish
                    ? 'bg-ablue text-white'
                    : 'bg-s2 border border-sep text-l3'
                }`}
              >
                <TargetIcon className="w-3.5 h-3.5" />
                Elden
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {displayOrder.map((pi) => {
                const isSelected = playerScores[pi]?.finished;
                const isHand = playerScores[pi]?.handFinished;
                return (
                  <button key={pi} onClick={() => toggleFinished(pi)}
                    className={`py-3.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-between touch-manipulation active:scale-[0.97] ${
                      isSelected && isHand
                        ? 'bg-[var(--team1-bg)] border-2 border-[var(--team1-border)] text-ablue'
                        : isSelected
                        ? 'bg-[var(--success-bg)] border-2 border-[var(--success-border)] text-agreen'
                        : 'bg-s2 border border-sep text-l2'
                    }`}>
                    <span>{gameData.players[pi]}</span>
                    {isSelected && isHand
                      ? <TargetIcon className="w-5 h-5" />
                      : isSelected
                      ? <CheckCircleIcon className="w-5 h-5" />
                      : <CircleIcon className="w-5 h-5" />}
                  </button>
                );
              })}
            </div>
            {isGroupMode && !isHandFinish && (
              <p className="text-l3 text-xs mt-3">Grup modunda takım arkadaşının puanı otomatik 0 olur</p>
            )}
          </div>
        </div>

        {/* Yapışık Kaydet Butonu */}
        <div className="fixed bottom-0 left-0 right-0 bg-s0h backdrop-blur-md border-t border-sep px-4 py-3">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={handleSubmit}
              className="w-full py-4 rounded-xl bg-ablue hover:opacity-90 active:scale-[0.98] text-white font-bold text-base transition-all touch-manipulation"
            >
              Round'u Kaydet
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Skor tablosu görünümü ─────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-s0">
      <div className="sticky top-0 z-10 bg-s0h backdrop-blur-md border-b border-sep">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo size="sm" />
          <ThemeToggle />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
        {/* Oyuncu Kartları */}
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
                <div key={index} className={`rounded-xl p-2.5 text-center ${gameData.dealerIndex === index ? 'border-2 border-ablue bg-s2' : 'border bg-s2 border-sep'}`}>
                  <div className="font-semibold text-xs leading-tight text-l1" style={{ wordBreak: 'break-word' }}>{player.name}</div>
                  {showCalculation && (
                    <div className="mt-2 pt-2 border-t border-sep">
                      <div className={`text-sm font-bold ${getTotalScore(index) < 0 ? 'text-agreen' : 'text-l1'}`}>
                        {getTotalScore(index)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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

        {/* Round Geçmişi */}
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
              <div className="grid gap-1 px-3 py-2 bg-s2" style={{ gridTemplateColumns: '1.5rem 1fr 1fr 1fr 1fr 2rem' }}>
                <div className="text-l4 text-[10px] text-center">#</div>
                {displayOrder.map((idx, colIdx) => (
                  <div key={idx} className={`text-[10px] text-center font-medium truncate px-0.5 text-l3 min-w-0 ${isGroupMode && colIdx === 2 ? 'border-l border-sep' : ''}`}>
                    {players[idx].name}
                  </div>
                ))}
                <div />
              </div>

              {players[0].scores.map((_, roundIndex) => (
                <div key={roundIndex} className="grid gap-1 px-3 py-2 border-t border-sep hover:bg-s2 transition-colors" style={{ gridTemplateColumns: '1.5rem 1fr 1fr 1fr 1fr 2rem' }}>
                  <div className="text-l3 text-xs text-center self-center">{roundIndex + 1}</div>
                  {displayOrder.map((playerIndex, colIdx) => {
                    const score = players[playerIndex].scores[roundIndex];
                    return (
                      <div key={playerIndex} className={`text-center self-center ${isGroupMode && colIdx === 2 ? 'border-l border-sep' : ''}`}>
                        <span className={`text-xs font-bold ${score < 0 ? 'text-agreen' : 'text-l1'}`}>{score}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => { startEditRound(roundIndex); setSelectedRoundDetails(null); setShowCalculation(false); }}
                      className="w-6 h-6 rounded-full bg-[var(--team1-bg)] border border-[var(--team1-border)] text-ablue flex items-center justify-center transition-colors active:scale-[0.93] touch-manipulation"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Yeni Round */}
        <div className={`${glassCard} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-l3 text-sm">Sonraki round</span>
            <span className="text-l1 font-semibold text-sm">Round {currentRound}</span>
          </div>
          <button
            onClick={goToRoundView}
            className="w-full bg-ablue hover:opacity-90 active:scale-[0.98] text-white font-bold py-4 rounded-xl text-base transition-all touch-manipulation"
          >
            + Yeni Round Ekle
          </button>
        </div>

        {/* Aksiyon Butonları */}
        <div className="grid grid-cols-3 gap-2 pb-4">
          <button
            onClick={() => { calculateTotals(); setSelectedRoundDetails(null); }}
            className="bg-s2 hover:opacity-90 active:scale-[0.97] border border-sep py-3.5 rounded-xl text-sm font-medium transition-all touch-manipulation flex flex-col items-center gap-1"
          >
            <ChartIcon className="w-5 h-5 text-ablue" />
            <span className="text-xs text-l2">Skorlar</span>
          </button>
          <button
            onClick={() => openConfirmModal('newGame')}
            className="bg-s2 hover:opacity-90 active:scale-[0.97] border border-sep py-3.5 rounded-xl text-sm font-medium transition-all touch-manipulation flex flex-col items-center gap-1"
          >
            <RefreshIcon className="w-5 h-5 text-ablue" />
            <span className="text-xs text-l3">Yeni Oyun</span>
          </button>
          <button
            onClick={() => openConfirmModal('finish')}
            className="bg-[var(--danger-bg)] hover:opacity-90 active:scale-[0.97] border border-[var(--danger-border)] text-ared py-3.5 rounded-xl text-sm font-medium transition-all touch-manipulation flex flex-col items-center gap-1"
          >
            <FlagIcon />
            <span className="text-xs">Bitir</span>
          </button>
        </div>
      </div>

      {/* ── MODALLER ── */}

      {/* Round Detay Modal */}
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
                    {detail.players.map((player, index) => (
                      <div key={index} className="grid grid-cols-7 gap-1 px-2 py-2.5 rounded-lg text-xs text-center bg-s2">
                        <div className="font-medium truncate text-l2">{player.name}</div>
                        <div className={player.points < 0 ? 'text-agreen' : 'text-l1'}>{player.points || '—'}</div>
                        <div className={player.individualPenalty ? 'text-aorange' : 'text-l4'}>{player.individualPenalty || '—'}</div>
                        <div className={isGroupMode && player.teamPenalty ? 'text-l1' : 'text-l4'}>{(isGroupMode && player.teamPenalty) ? player.teamPenalty : '—'}</div>
                        <div className={player.hasOkey1 || player.hasOkey2 ? 'text-ablue' : 'text-l4'}>{[player.hasOkey1 && '●', player.hasOkey2 && '●'].filter(Boolean).join(' ') || '—'}</div>
                        <div className={player.finished ? 'text-agreen' : 'text-l4'}>{player.finished ? '✓' : '—'}</div>
                        <div className={`font-bold ${player.total < 0 ? 'text-agreen' : 'text-l1'}`}>{player.total}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-l3 text-center py-8">Detay bulunamadı</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Round Düzenleme Modal */}
      {isEditMode && editRoundData && (
        <div className={modalBase}>
          <div className={`${modalCard} max-w-lg`}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-l1 font-semibold">Round {editRoundData.round} — Düzenle</h3>
                <div className="flex gap-2">
                  <button onClick={saveRoundEdit} className="bg-ablue active:scale-[0.96] text-white font-bold px-4 py-2 rounded-xl text-sm transition-all touch-manipulation">Kaydet</button>
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

      {/* Onay Modal */}
      {showConfirmModal && (
        <div className={modalBase}>
          <div className={modalCard}>
            <div className="p-6 text-center">
              <div className="flex justify-center mb-3">
                {confirmAction === 'finish' ? <FlagIcon className="w-10 h-10 text-ared" /> : <RefreshIcon className="w-10 h-10 text-ablue" />}
              </div>
              <h2 className="text-l1 font-bold text-lg mb-2">
                {confirmAction === 'finish' ? 'Oyunu Bitir' : 'Yeni Oyun'}
              </h2>
              <p className="text-l3 text-sm mb-5 leading-relaxed">
                {confirmAction === 'finish' ? 'Oyunu bitirip sonuç ekranına geçmek istediğinizden emin misiniz?' : 'Mevcut oyun verileri silinecek. Devam etmek istiyor musunuz?'}
              </p>
              <div className="bg-[var(--warn-bg)] border border-[var(--warn-border)] rounded-xl px-4 py-2.5 mb-5">
                <span className="text-ayellow text-xs">
                  {confirmAction === 'finish' ? 'Bu işlem geri alınamaz!' : 'Tüm round verileri kaybolacak!'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setShowConfirmModal(false); setConfirmAction(null); }}
                  className="bg-s2 border border-sep text-l2 py-3 rounded-xl font-medium text-sm transition-colors active:scale-[0.97] touch-manipulation">İptal</button>
                <button onClick={handleConfirmAction}
                  className={`py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97] touch-manipulation ${confirmAction === 'finish' ? 'bg-[var(--danger-bg)] border border-[var(--danger-border)] text-ared hover:opacity-90' : 'bg-ablue hover:opacity-90 text-white'}`}>
                  {confirmAction === 'finish' ? 'Evet, Bitir' : 'Evet, Başlat'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Oyun Sonu Modal */}
      {showGameEndModal && gameEndData && (
        <div className={modalBase}>
          <div className={`${modalCard} max-w-lg`}>
            <div className="p-6">
              <div className="text-center pb-6">
                <div className="flex justify-center mb-3">
                  {gameEndData.winnerType === 'tie' ? <EqualIcon className="w-12 h-12 text-ablue" /> : <TrophyIcon className="w-12 h-12 text-ablue" />}
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

              {gameEndData.isGroup && (
                <div className="grid grid-cols-2 gap-2 mb-6">
                  <div className={`text-center px-4 py-3 rounded-2xl bg-s2 ${gameEndData.winnerType === 'group1' ? 'border-2 border-ablue' : 'border border-sep'}`}>
                    <p className="text-[11px] font-semibold text-l2 uppercase tracking-widest mb-1 truncate">{gameEndData.groupScores.group1.name}</p>
                    <p className="text-2xl font-bold text-l1">{gameEndData.groupScores.group1.total}</p>
                  </div>
                  <div className={`text-center px-4 py-3 rounded-2xl bg-s2 ${gameEndData.winnerType === 'group2' ? 'border-2 border-ablue' : 'border border-sep'}`}>
                    <p className="text-[11px] font-semibold text-l2 uppercase tracking-widest mb-1 truncate">{gameEndData.groupScores.group2.name}</p>
                    <p className="text-2xl font-bold text-l1">{gameEndData.groupScores.group2.total}</p>
                  </div>
                </div>
              )}

              {(() => {
                const allPlayers = gameEndData.playersWithStats || gameEndData.rankings || [];
                const cols = `3rem repeat(${allPlayers.length}, 1fr)`;
                const totalRounds = players[0]?.scores.length || 0;
                const rows = [
                  { label: 'Puan', get: (p: any) => p.score, color: (v: any) => v < 0 ? 'text-agreen' : 'text-l1' },
                  { label: '*RBP', get: (p: any) => totalRounds > 0 ? (p.score / totalRounds).toFixed(1) : '—', color: (v: any) => parseFloat(v) < 0 ? 'text-agreen' : 'text-l1' },
                  { label: 'Okey', get: (p: any) => p.stats?.totalOkey || 0, color: (v: any) => v > 0 ? 'text-l1' : 'text-l4' },
                  { label: 'Bitiş', get: (p: any) => (p.stats?.totalFinish || 0) + (p.stats?.totalHandFinish || 0), color: (v: any) => v > 0 ? 'text-agreen' : 'text-l4' },
                  { label: 'Ceza', get: (p: any) => p.stats?.totalIndividualPenalty || 0, color: (v: any) => v > 0 ? 'text-l1' : 'text-l4' },
                ];
                return (
                  <div className="rounded-2xl overflow-hidden border border-sep mb-5">
                    <div className="grid bg-s2 px-4 py-2 gap-1" style={{ gridTemplateColumns: cols }}>
                      <div />
                      {allPlayers.map((p: any, i: number) => (
                        <div key={i} className="text-center min-w-0">
                          <div className="text-[11px] font-semibold text-l3 mb-0.5">{i + 1}.</div>
                          <div className="text-[10px] font-semibold text-l2 truncate">{p.name}</div>
                        </div>
                      ))}
                    </div>
                    {rows.map((row, ri) => (
                      <div key={ri} className="grid border-t border-sep px-4 py-3 gap-1 items-center" style={{ gridTemplateColumns: cols }}>
                        <div className="text-[10px] text-l3 uppercase tracking-wide">{row.label}</div>
                        {allPlayers.map((p: any, i: number) => {
                          const val = row.get(p);
                          return <div key={i} className={`text-sm font-semibold text-center min-w-0 ${row.color(val)}`}>{val}</div>;
                        })}
                      </div>
                    ))}
                  </div>
                );
              })()}

              <p className="text-[10px] text-l4 -mt-3 mb-5">* RBP: Round Başına Puan</p>

              <div className="space-y-2">
                <button
                  onClick={() => { setShowGameEndModal(false); openConfirmModal('newGame'); }}
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
