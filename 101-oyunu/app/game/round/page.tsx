'use client';

import { useState, useEffect, Suspense, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CheckCircleIcon, CircleIcon, TargetIcon } from '@/components/Icons';

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

interface GameData {
  gameMode: 'group' | 'single';
  group1Name?: string;
  group2Name?: string;
  players: string[];
  currentRound: number;
  dealerIndex: number;
}

function RoundPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [playerScores, setPlayerScores] = useState<PlayerScore[]>([]);
  const [inputValues, setInputValues] = useState<string[]>(['', '', '', '']);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { router.prefetch('/game'); }, [router]);

  useEffect(() => {
    const mode = searchParams.get('mode') as 'group' | 'single';
    const group1 = searchParams.get('group1');
    const group2 = searchParams.get('group2');
    const round = parseInt(searchParams.get('round') || '1');
    const dealerParam = searchParams.get('dealer');
    const playerNames = [
      searchParams.get('player1'), searchParams.get('player2'),
      searchParams.get('player3'), searchParams.get('player4')
    ].filter(Boolean) as string[];

    if (mode && playerNames.length === 4) {
      const data: GameData = {
        gameMode: mode, players: playerNames, currentRound: round,
        dealerIndex: dealerParam ? parseInt(dealerParam) : 0,
      };
      if (mode === 'group') { data.group1Name = group1 || '1. Takım'; data.group2Name = group2 || '2. Takım'; }
      setGameData(data);
      setPlayerScores(Array(4).fill(null).map(() => ({
        points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0, hasOkey1: false, hasOkey2: false, finished: false, handFinished: false
      })));
      setInputValues(['', '', '', '']);
    }
  }, [searchParams]);

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

  const getTeammateIndex = useCallback((playerIndex: number) => {
    if (!gameData || gameData.gameMode !== 'group') return -1;
    if (playerIndex === 0) return 2;
    if (playerIndex === 1) return 3;
    if (playerIndex === 2) return 0;
    if (playerIndex === 3) return 1;
    return -1;
  }, [gameData?.gameMode]);

  const toggleFinished = useCallback((playerIndex: number) => {
    const wasFinished = playerScores[playerIndex].finished;
    const newFinished = !wasFinished;
    const ti = getTeammateIndex(playerIndex);

    setPlayerScores(prev => {
      const newScores = prev.map((score, index) => {
        if (index === playerIndex)
          return { ...score, finished: newFinished, handFinished: false, points: newFinished ? 0 : score.points };
        if (!wasFinished)
          return { ...score, finished: false, handFinished: false };
        return score;
      });
      if (newFinished && gameData?.gameMode === 'group' && ti !== -1)
        newScores[ti] = { ...newScores[ti], points: 0 };
      return newScores;
    });

    if (newFinished) {
      const newIV = [...inputValues];
      newIV[playerIndex] = '';
      if (gameData?.gameMode === 'group' && ti !== -1) newIV[ti] = '';
      setInputValues(newIV);
    }
  }, [playerScores, gameData?.gameMode, getTeammateIndex, inputValues]);

  const toggleHandFinished = useCallback((playerIndex: number) => {
    if (!gameData) return;
    const newHandFinished = !playerScores[playerIndex].handFinished;
    const ti = getTeammateIndex(playerIndex);
    const isGroup = gameData.gameMode === 'group';

    setPlayerScores(prev => prev.map((score, index) => {
      const reset = { ...score, handFinished: false, finished: false };
      if (!newHandFinished) return reset;
      if (isGroup) {
        if (index === playerIndex) return { ...reset, points: -202, handFinished: true, finished: true };
        if (index === ti) return { ...reset, points: 0 };
        return { ...reset, points: 202, individualPenalty: 202, penalty: 202 };
      }
      if (index === playerIndex) return { ...reset, points: -202, handFinished: true, finished: true };
      return { ...reset, points: 202, individualPenalty: 202, penalty: 202 };
    }));

    if (newHandFinished) {
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
      setInputValues(['', '', '', '']);
    }
  }, [playerScores, gameData, getTeammateIndex]);

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

  const handleSubmit = useCallback(async () => {
    if (!gameData || submitting) return;
    setSubmitting(true);
    const roundScores = playerScores.map((_, index) => getTotal(index));
    const nextDealer = (gameData.dealerIndex + 1) % gameData.players.length;
    const roundDetails = {
      round: gameData.currentRound,
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
        total: getTotal(index)
      }))
    };
    const existingDetails = JSON.parse(localStorage.getItem('roundDetails') || '[]');
    existingDetails.push(roundDetails);
    localStorage.setItem('roundDetails', JSON.stringify(existingDetails));
    const gameId = localStorage.getItem('currentGameId');
    if (gameId) {
      fetch(`/api/games/${gameId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_rounds: gameData.currentRound }),
      }).catch((error) => console.error('Round kaydetme hatası:', error));
    }
    const params = new URLSearchParams({
      mode: gameData.gameMode,
      player1: gameData.players[0], player2: gameData.players[1],
      player3: gameData.players[2], player4: gameData.players[3],
      scores: roundScores.join(','),
      round: gameData.currentRound.toString(),
      dealer: nextDealer.toString(),
    });
    if (gameData.gameMode === 'group') { params.append('group1', gameData.group1Name!); params.append('group2', gameData.group2Name!); }
    router.push(`/game?${params.toString()}`);
  }, [gameData, playerScores, getTotal, router, submitting]);

  const handlePointChange = useCallback((playerIndex: number, value: string) => {
    if (!/^-?\d*$/.test(value) || value.split('-').length > 2 || (value.includes('-') && value.indexOf('-') !== 0)) return;
    const newIV = [...inputValues]; newIV[playerIndex] = value; setInputValues(newIV);
    if (value === '' || value === '-') updatePlayerScore(playerIndex, 'points', 0);
    else { const n = parseInt(value); if (!isNaN(n) && n >= -999 && n <= 999) updatePlayerScore(playerIndex, 'points', n); }
  }, [inputValues, updatePlayerScore]);

  const glassCard = 'bg-s1 border border-sep rounded-2xl';

  if (!gameData) {
    return (
      <div className="min-h-screen bg-s0 flex items-center justify-center">
        <div className="text-l3 text-sm">Yükleniyor...</div>
      </div>
    );
  }

  const isGroupMode = gameData.gameMode === 'group';
  const displayOrder = isGroupMode ? [0, 2, 1, 3] : [0, 1, 2, 3];
  const rowGrid = isGroupMode ? 'relative grid grid-cols-4 gap-1.5' : 'grid grid-cols-4 gap-2';
  const Sep = () => isGroupMode
    ? <div className="absolute inset-y-0 left-1/2 w-px bg-sep -translate-x-px pointer-events-none" />
    : null;

  return (
    <div className="min-h-screen bg-s0 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-s0h backdrop-blur-md border-b border-sep">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl bg-s2 border border-sep text-l2 flex items-center justify-center transition-colors active:scale-[0.94] touch-manipulation flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-l1 font-bold text-base">Round {gameData.currentRound}</h1>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {/* Score Entry Card */}
        <div className={`${glassCard} overflow-hidden`}>

          {/* Takım başlıkları */}
          {isGroupMode && (
            <div className="grid grid-cols-2 px-3 pt-3 pb-1">
              <p className="text-[10px] font-semibold text-l3 text-center uppercase tracking-widest">{gameData.group1Name}</p>
              <p className="text-[10px] font-semibold text-l3 text-center uppercase tracking-widest">{gameData.group2Name}</p>
            </div>
          )}

          {/* Player name headers */}
          <div className={`${rowGrid} px-3 ${isGroupMode ? 'pt-1' : 'pt-3'} pb-2`}>
            <Sep />
            {displayOrder.map((pi) => (
              <div key={pi} className={`rounded-lg px-1 py-2 text-center bg-s2 ${gameData.dealerIndex === pi ? 'border-2 border-ablue' : 'border border-sep'}`}>
                <div className="text-[11px] font-semibold leading-tight text-l1" style={{wordBreak: 'break-word'}}>{gameData.players[pi]}</div>
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
                      className={`w-full px-1 py-3 border rounded-xl text-center text-sm font-semibold transition-colors ${
                        isDisabled ? 'bg-s2 border-sep text-l4 cursor-not-allowed' : 'bg-s2 border-sep text-l1'
                      }`}
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
                    <button
                      onClick={() => removePenalty(pi, 'individual')}
                      disabled={playerScores[pi]?.individualPenalty === 0}
                      className="w-7 h-7 rounded-full bg-s2 border border-sep text-l2 flex items-center justify-center text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-[0.93] touch-manipulation"
                    >−</button>
                    <div className={`text-xs min-w-[22px] text-center ${playerScores[pi]?.individualPenalty ? 'text-ablue font-bold' : 'text-l3 font-semibold'}`}>
                      {playerScores[pi]?.individualPenalty || 0}
                    </div>
                    <button
                      onClick={() => addPenalty(pi, 'individual')}
                      className="w-7 h-7 rounded-full bg-s2 border border-sep text-l2 flex items-center justify-center text-sm font-bold transition-colors active:scale-[0.93] touch-manipulation"
                    >+</button>
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
                      <button
                        onClick={() => removePenalty(pi, 'team')}
                        disabled={playerScores[pi]?.teamPenalty === 0}
                        className="w-7 h-7 rounded-full bg-s2 border border-sep text-l2 flex items-center justify-center text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-[0.93] touch-manipulation"
                      >−</button>
                      <div className={`text-xs min-w-[22px] text-center ${playerScores[pi]?.teamPenalty ? 'text-ablue font-bold' : 'text-l3 font-semibold'}`}>
                        {playerScores[pi]?.teamPenalty || 0}
                      </div>
                      <button
                        onClick={() => addPenalty(pi, 'team')}
                        className="w-7 h-7 rounded-full bg-s2 border border-sep text-l2 flex items-center justify-center text-sm font-bold transition-colors active:scale-[0.93] touch-manipulation"
                      >+</button>
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
                      <button key={n}
                        onClick={() => toggleOkey(pi, n)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-[0.93] touch-manipulation ${
                          (n === 1 ? playerScores[pi]?.hasOkey1 : playerScores[pi]?.hasOkey2)
                            ? 'bg-ablue text-white'
                            : 'bg-s2 border border-sep text-l3'
                        }`}
                      >
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

        {/* Finish Section */}
        <div className={`${glassCard} p-4`}>
          <div className="mb-3">
            <h3 className="text-l2 font-semibold text-sm">Oyunu Bitiren</h3>
            <p className="text-l3 text-xs mt-0.5">−101 puan · Sadece 1 oyuncu</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {displayOrder.map((pi) => (
              <button
                key={pi}
                onClick={() => toggleFinished(pi)}
                disabled={playerScores.some(s => s.handFinished)}
                className={`py-3.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-between touch-manipulation active:scale-[0.97] ${
                  playerScores[pi]?.finished && !playerScores[pi]?.handFinished
                    ? 'bg-[var(--success-bg)] border-2 border-[var(--success-border)] text-agreen'
                    : playerScores.some(s => s.handFinished)
                    ? 'bg-s2 border border-sep text-l4 cursor-not-allowed'
                    : 'bg-s2 border border-sep text-l2'
                }`}
              >
                <span>{gameData.players[pi]}</span>
                {playerScores[pi]?.finished && !playerScores[pi]?.handFinished
                  ? <CheckCircleIcon className="w-5 h-5" />
                  : <CircleIcon className="w-5 h-5" />}
              </button>
            ))}
          </div>
          {gameData.gameMode === 'group' && (
            <p className="text-l3 text-xs mt-3">Grup modunda takım arkadaşının puanı otomatik 0 olur</p>
          )}
        </div>

        {/* Hand Finish Section */}
        <div className={`${glassCard} p-4`}>
          <div className="mb-3">
            <h3 className="text-l1 font-semibold text-sm">Elden Bitiren</h3>
            <p className="text-l3 text-xs mt-0.5">
              −202 puan · {gameData.gameMode === 'group' ? 'Karşı takıma +404 puan' : 'Diğer oyunculara +404 puan'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {displayOrder.map((pi) => (
              <button
                key={pi}
                onClick={() => toggleHandFinished(pi)}
                disabled={playerScores.some(s => s.finished && !s.handFinished)}
                className={`py-3.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-between touch-manipulation active:scale-[0.97] ${
                  playerScores[pi]?.handFinished
                    ? 'bg-[var(--team1-bg)] border-2 border-[var(--team1-border)] text-ablue'
                    : playerScores.some(s => s.finished && !s.handFinished)
                    ? 'bg-s2 border border-sep text-l4 cursor-not-allowed'
                    : 'bg-s2 border border-sep text-l2'
                }`}
              >
                <span>{gameData.players[pi]}</span>
                {playerScores[pi]?.handFinished
                  ? <TargetIcon className="w-5 h-5" />
                  : <CircleIcon className="w-5 h-5" />}
              </button>
            ))}
          </div>
          <p className="text-l3 text-xs mt-3">Tüm puanlar otomatik hesaplanır</p>
        </div>
      </div>

      {/* Sticky Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-s0h backdrop-blur-md border-t border-sep px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`w-full py-4 rounded-xl font-bold text-base transition-all touch-manipulation ${
              submitting
                ? 'bg-s2 border border-sep text-l4 cursor-not-allowed'
                : 'bg-ablue hover:opacity-90 active:scale-[0.98] text-white'
            }`}
          >
            {submitting ? 'Kaydediliyor...' : "Round'u Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RoundPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-s0 flex items-center justify-center">
        <div className="text-l3 text-sm">Yükleniyor...</div>
      </div>
    }>
      <RoundPageContent />
    </Suspense>
  );
}
