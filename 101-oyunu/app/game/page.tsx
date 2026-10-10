'use client';

import { useState, useEffect, Suspense, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ChartIcon, FlagIcon, TrophyIcon, EqualIcon, CheckCircleIcon, CircleIcon, TargetIcon } from '@/components/Icons';
import { Logo } from '@/components/Logo';
import {
  GameInfo, SeatInfo, RoundRecord, GameResultRow, SeatScore, SyncState,
  loadGame, mergePending, enqueueRound, flushPendingRounds, getPendingRounds, discardPendingRounds,
  finishGame, endGameEarly, respondInvite, dealerForRound, errorText,
} from '@/lib/gameApi';

// ── Types ─────────────────────────────────────────────────────────────────────

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

const ACTIVE_GAME_KEY = 'activeGameId';

const emptyPlayerScore = (): PlayerScore => ({
  points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0,
  hasOkey1: false, hasOkey2: false, finished: false, handFinished: false,
});

const toPlayerScore = (s: SeatScore): PlayerScore => ({
  points: s.points,
  penalty: s.individualPenalty + s.teamPenalty,
  individualPenalty: s.individualPenalty,
  teamPenalty: s.teamPenalty,
  hasOkey1: s.okey1,
  hasOkey2: s.okey2,
  finished: s.finished,
  handFinished: s.handFinished,
});

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

// ── Component ─────────────────────────────────────────────────────────────────

function GamePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const gameId = searchParams.get('id');

  // Sunucudaki oyun
  const [game, setGame] = useState<GameInfo | null>(null);
  const [seats, setSeats] = useState<SeatInfo[]>([]);
  const [rounds, setRounds] = useState<RoundRecord[]>([]);
  const [results, setResults] = useState<GameResultRow[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [sync, setSync] = useState<SyncState>({ pending: 0, error: null, offline: false });

  // Aktif görünüm: skor tablosu veya el girişi
  const [view, setView] = useState<'scoreboard' | 'round'>('scoreboard');
  const [editingRoundNo, setEditingRoundNo] = useState<number | null>(null);
  const [entryStartedAt, setEntryStartedAt] = useState<string | null>(null);

  const [showCalculation, setShowCalculation] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'finish' | 'abandon' | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [showResults, setShowResults] = useState(false);

  // El girişi state
  const [playerScores, setPlayerScores] = useState<PlayerScore[]>([]);
  const [inputValues, setInputValues] = useState<string[]>(['', '', '', '']);
  const [isHandFinish, setIsHandFinish] = useState(false);

  const viewRef = useRef(view);
  viewRef.current = view;

  // ── Yükleme ve senkronizasyon ────────────────────────────────────────────────

  const reload = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await loadGame(gameId);
      if (!data) { setLoadState('notfound'); return; }
      setGame(data.game);
      setSeats(data.seats);
      setRounds(mergePending(gameId, data.rounds));
      setResults(data.results);
      setLoadState('ready');
      if (!['pending', 'active'].includes(data.game.status)) {
        try { if (localStorage.getItem(ACTIVE_GAME_KEY) === gameId) localStorage.removeItem(ACTIVE_GAME_KEY); } catch { /* yok */ }
      }
    } catch (error) {
      console.error('Oyun yüklenemedi:', error);
      setLoadState((prev) => (prev === 'ready' ? prev : 'error'));
    }
  }, [gameId]);

  const flush = useCallback(async () => {
    if (!gameId) return;
    const before = getPendingRounds(gameId).length;
    const state = await flushPendingRounds(gameId);
    setSync(state);
    if (before > state.pending) await reload();
  }, [gameId, reload]);

  useEffect(() => {
    if (!gameId) { setLoadState('notfound'); return; }
    setSync((s) => ({ ...s, pending: getPendingRounds(gameId).length }));
    reload().then(flush);
  }, [gameId, reload, flush]);

  // Diğer telefonlardan girilen elleri ve onayları görmek için düzenli kontrol
  const status = game?.status;
  useEffect(() => {
    if (!gameId || !status || !['pending', 'active'].includes(status)) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible' || viewRef.current !== 'scoreboard') return;
      if (getPendingRounds(gameId).length) flush();
      else reload();
    }, status === 'pending' ? 4000 : 15000);
    const onOnline = () => flush();
    window.addEventListener('online', onOnline);
    return () => { clearInterval(timer); window.removeEventListener('online', onOnline); };
  }, [gameId, status, flush, reload]);

  // ── Türetilmiş değerler ──────────────────────────────────────────────────────

  const isGroupMode = game?.mode === 'group';
  const names = seats.map((s) => s.name);
  const group1Name = game?.team1_name ?? '1. Takım';
  const group2Name = game?.team2_name ?? '2. Takım';
  const displayOrder = isGroupMode ? [0, 2, 1, 3] : [0, 1, 2, 3];

  const mySeat = seats.find((s) => user && s.user_id === user.id);
  const canWrite = !!game && game.status === 'active' && (
    mySeat?.invite_status === 'accepted'
    || (!game.is_ranked && (game.created_by === null || game.created_by === user?.id))
  );

  const nextRoundNo = rounds.length + 1;
  const nextDealer = game ? dealerForRound(game.first_dealer_seat, nextRoundNo) : 0;

  const totalScores = useMemo(
    () => [0, 1, 2, 3].map((i) => rounds.reduce((sum, r) => sum + (r.scores[i]?.total ?? 0), 0)),
    [rounds],
  );

  const getTeammateIndex = useCallback((playerIndex: number) => {
    if (!isGroupMode || playerIndex < 0) return -1;
    return (playerIndex + 2) % 4;
  }, [isGroupMode]);

  const groupScores = isGroupMode ? {
    group1: { name: group1Name, total: totalScores[0] + totalScores[2] },
    group2: { name: group2Name, total: totalScores[1] + totalScores[3] },
  } : null;

  const scoreDifference = (() => {
    if (groupScores) {
      const leader = groupScores.group1.total < groupScores.group2.total ? groupScores.group1 : groupScores.group2;
      return { difference: Math.abs(groupScores.group1.total - groupScores.group2.total), leader: leader.name };
    }
    const ranked = [0, 1, 2, 3].map((i) => ({ name: names[i], score: totalScores[i] })).sort((a, b) => a.score - b.score);
    return { difference: ranked.length > 1 ? Math.abs(ranked[0].score - ranked[1].score) : 0, leader: ranked[0]?.name };
  })();

  const getPlayerStats = (playerIndex: number) => {
    let okey = 0, finish = 0, penalties = 0;
    rounds.forEach((r) => {
      const p = r.scores[playerIndex];
      if (!p) return;
      if (p.okey1) okey++;
      if (p.okey2) okey++;
      if (p.finished) finish++;
      if (!r.scores.some((s) => s.handFinished)) penalties += p.individualPenalty / 101;
    });
    return { okey, finish, penalties: Math.round(penalties * 10) / 10 };
  };

  // ── El girişi ────────────────────────────────────────────────────────────────

  const openRoundEntry = (roundNo: number | null) => {
    const existing = roundNo === null ? undefined : rounds.find((r) => r.roundNo === roundNo);
    if (existing) {
      setPlayerScores(existing.scores.map(toPlayerScore));
      setInputValues(existing.scores.map((s) => (s.finished && !s.handFinished) || s.points === 0 ? '' : String(s.points)));
      setIsHandFinish(existing.scores.some((s) => s.handFinished));
    } else {
      setPlayerScores(Array(4).fill(null).map(emptyPlayerScore));
      setInputValues(['', '', '', '']);
      setIsHandFinish(false);
    }
    setEditingRoundNo(existing ? existing.roundNo : null);
    setEntryStartedAt(new Date().toISOString());
    setShowCalculation(false);
    setView('round');
  };

  const updatePlayerScore = useCallback((playerIndex: number, field: keyof PlayerScore, value: number | boolean) => {
    setPlayerScores(prev => prev.map((score, index) => index === playerIndex ? { ...score, [field]: value } : score));
  }, []);

  const addPenalty = useCallback((playerIndex: number, type: 'individual' | 'team') => {
    setPlayerScores(prev => prev.map((score, index) => {
      if (type === 'individual' && index === playerIndex) {
        const n = { ...score, individualPenalty: score.individualPenalty + 101 };
        n.penalty = n.individualPenalty + n.teamPenalty; return n;
      } else if (type === 'team' && isGroupMode) {
        if (index % 2 === playerIndex % 2) {
          const n = { ...score, teamPenalty: score.teamPenalty + 50.5 };
          n.penalty = n.individualPenalty + n.teamPenalty; return n;
        }
      }
      return score;
    }));
  }, [isGroupMode]);

  const removePenalty = useCallback((playerIndex: number, type: 'individual' | 'team') => {
    setPlayerScores(prev => prev.map((score, index) => {
      if (type === 'individual' && index === playerIndex) {
        const n = { ...score, individualPenalty: Math.max(0, score.individualPenalty - 101) };
        n.penalty = n.individualPenalty + n.teamPenalty; return n;
      } else if (type === 'team' && isGroupMode) {
        if (index % 2 === playerIndex % 2) {
          const n = { ...score, teamPenalty: Math.max(0, score.teamPenalty - 50.5) };
          n.penalty = n.individualPenalty + n.teamPenalty; return n;
        }
      }
      return score;
    }));
  }, [isGroupMode]);

  const toggleOkey = useCallback((playerIndex: number, okeyNumber: 1 | 2) => {
    const okeyField = okeyNumber === 1 ? 'hasOkey1' : 'hasOkey2';
    setPlayerScores(prev => prev.map((score, index) => {
      if (index === playerIndex) return { ...score, [okeyField]: !score[okeyField] };
      return { ...score, [okeyField]: false };
    }));
  }, []);

  // Elden bitirme: bitiren −202; grupta ortağı 0, rakipler 202 + 202 ceza; tekli: diğer herkes 202 + 202 ceza
  const applyHandFinish = useCallback((finisherIndex: number) => {
    const ti = getTeammateIndex(finisherIndex);
    setPlayerScores(prev => prev.map((score, index) => {
      const base = { ...score, points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0, finished: false, handFinished: false };
      if (index === finisherIndex) return { ...base, points: -202, handFinished: true, finished: true };
      if (index === ti) return base;
      return { ...base, points: 202, individualPenalty: 202, penalty: 202 };
    }));
    setInputValues([0, 1, 2, 3].map(i => i === finisherIndex ? '-202' : i === ti ? '0' : '202'));
  }, [getTeammateIndex]);

  const clearFinish = useCallback(() => {
    setPlayerScores(prev => prev.map(score => ({
      ...score, points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0, finished: false, handFinished: false,
    })));
    setInputValues(['', '', '', '']);
  }, []);

  const toggleFinished = useCallback((playerIndex: number) => {
    const wasFinished = playerScores[playerIndex].finished;
    const newFinished = !wasFinished;
    const ti = getTeammateIndex(playerIndex);

    if (isHandFinish) {
      if (newFinished) applyHandFinish(playerIndex);
      else clearFinish();
      return;
    }

    // Normal bitirme
    setPlayerScores(prev => {
      const newScores = prev.map((score, index) => {
        if (index === playerIndex) return { ...score, finished: newFinished, handFinished: false, points: newFinished ? 0 : score.points };
        if (!wasFinished) return { ...score, finished: false, handFinished: false };
        return score;
      });
      if (newFinished && ti !== -1) newScores[ti] = { ...newScores[ti], points: 0 };
      return newScores;
    });
    if (newFinished) {
      const newIV = [...inputValues];
      newIV[playerIndex] = '';
      if (ti !== -1) newIV[ti] = '';
      setInputValues(newIV);
    }
  }, [playerScores, getTeammateIndex, inputValues, isHandFinish, applyHandFinish, clearFinish]);

  const toggleIsHandFinish = useCallback(() => {
    const newIsHandFinish = !isHandFinish;
    const finisherIndex = playerScores.findIndex(s => s.finished);

    if (finisherIndex !== -1) {
      if (newIsHandFinish) {
        applyHandFinish(finisherIndex);
      } else {
        // Elden → Normal: mevcut bitireni normal kurallarla yeniden uygula
        setPlayerScores(prev => prev.map((score, index) => {
          if (index === finisherIndex) return { ...score, points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0, handFinished: false, finished: true };
          return { ...score, points: 0, penalty: 0, individualPenalty: 0, teamPenalty: 0, finished: false, handFinished: false };
        }));
        setInputValues(['', '', '', '']);
      }
    }

    setIsHandFinish(newIsHandFinish);
  }, [isHandFinish, playerScores, applyHandFinish]);

  const isPointInputDisabled = useCallback((playerIndex: number) => {
    if (playerScores[playerIndex]?.finished) return true;
    const ti = getTeammateIndex(playerIndex);
    return ti !== -1 ? playerScores[ti]?.finished || false : false;
  }, [getTeammateIndex, playerScores]);

  const getTotal = useCallback((playerIndex: number) => {
    const score = playerScores[playerIndex];
    if (!score) return 0;
    let total = score.points + score.penalty;
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
    if (!game || !gameId) return;
    const roundNo = editingRoundNo ?? nextRoundNo;
    const existing = rounds.find((r) => r.roundNo === roundNo);
    const scores: SeatScore[] = playerScores.map((s, i) => ({
      points: s.points,
      individualPenalty: s.individualPenalty,
      teamPenalty: s.teamPenalty,
      okey1: s.hasOkey1,
      okey2: s.hasOkey2,
      finished: s.finished,
      handFinished: s.handFinished,
      total: getTotal(i),
    }));

    try {
      enqueueRound(gameId, {
        roundNo,
        dealerSeat: existing?.dealerSeat ?? dealerForRound(game.first_dealer_seat, roundNo),
        scores,
        baseRevision: existing?.revision ?? 0,
        clientTime: new Date().toISOString(),
        entryStartedAt,
      });
    } catch (error) {
      console.error('Round kuyruğa alınamadı:', error);
      alert(`Round kaydedilemedi: ${errorText(error)}`);
      return;
    }
    setRounds((prev) => mergePending(gameId, prev));
    setSync((s) => ({ ...s, pending: getPendingRounds(gameId).length }));
    setEditingRoundNo(null);
    setView('scoreboard');
    flush();
  }, [game, gameId, editingRoundNo, nextRoundNo, rounds, playerScores, getTotal, entryStartedAt, flush]);

  // ── Oyun sonu / bırakma ──────────────────────────────────────────────────────

  const executeFinishGame = async () => {
    if (!gameId) return;
    setActionBusy(true);
    setActionError('');
    try {
      const state = await flushPendingRounds(gameId);
      setSync(state);
      if (state.pending) {
        setActionError(state.error
          ? `Kaydedilemeyen el var: ${state.error}`
          : 'İnternet bağlantısı yok. Eller gönderilince tekrar dene.');
        return;
      }
      await finishGame(gameId);
      await reload();
      setConfirmAction(null);
      setShowCalculation(false);
      setShowResults(true);
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setActionBusy(false);
    }
  };

  const executeAbandon = async () => {
    if (!gameId) return;
    setActionBusy(true);
    setActionError('');
    try {
      await flushPendingRounds(gameId);
      await endGameEarly(gameId);
      router.push('/');
    } catch (error) {
      setActionError(errorText(error));
      setActionBusy(false);
    }
  };

  const handleInvite = async (accept: boolean) => {
    if (!gameId) return;
    setActionBusy(true);
    try {
      await respondInvite(gameId, accept);
      await reload();
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setActionBusy(false);
    }
  };

  const discardFailedRounds = async () => {
    if (!gameId) return;
    discardPendingRounds(gameId);
    setSync({ pending: 0, error: null, offline: false });
    await reload();
  };

  // ── Paylaşılan stiller ────────────────────────────────────────────────────────

  const glassCard = 'bg-s1 border border-sep rounded-2xl';
  const modalBase = 'fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50';
  const modalCard = 'bg-s1 border border-sep rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto';
  const centered = (content: React.ReactNode) => (
    <div className="min-h-screen bg-s0 flex items-center justify-center p-5">
      <div className="w-full max-w-sm text-center">{content}</div>
    </div>
  );
  const homeButton = (
    <button
      onClick={() => router.push('/')}
      className="w-full mt-5 py-3.5 rounded-xl bg-ablue text-white font-bold text-sm active:scale-[0.98]"
    >
      Ana Sayfa
    </button>
  );

  if (loadState === 'loading' || authLoading) {
    return centered(<div className="text-l3 text-sm">Yükleniyor...</div>);
  }
  if (loadState === 'notfound' || !game) {
    return centered(<>
      <p className="text-l1 font-semibold">{loadState === 'error' ? 'Oyun yüklenemedi' : 'Oyun bulunamadı'}</p>
      <p className="text-l3 text-sm mt-1">{loadState === 'error' ? 'İnternet bağlantını kontrol et.' : 'Bağlantı hatalı olabilir.'}</p>
      {loadState === 'error' && (
        <button onClick={() => { setLoadState('loading'); reload(); }} className="w-full mt-5 py-3 rounded-xl bg-s2 border border-sep text-l2 text-sm font-medium">
          Tekrar dene
        </button>
      )}
      {homeButton}
    </>);
  }

  // ── Dereceli: onay bekleme / iptal ───────────────────────────────────────────

  if (game.status === 'pending' || game.status === 'cancelled') {
    const isCancelled = game.status === 'cancelled';
    const canCancel = !isCancelled && (game.created_by === user?.id || mySeat?.invite_status === 'accepted');
    return centered(<>
      <div className="flex justify-end mb-4"><ThemeToggle /></div>
      <p className="text-[10px] text-l3 uppercase tracking-widest mb-1">{isGroupMode ? 'Grup' : 'Tekli'} · dereceli</p>
      <h1 className="text-xl font-bold text-l1 mb-1">{isCancelled ? 'Oyun iptal edildi' : 'Onay bekleniyor'}</h1>
      <p className="text-l3 text-sm mb-6">
        {isCancelled
          ? (seats.some((s) => s.invite_status === 'declined') ? 'Bir oyuncu daveti reddetti.' : 'Oyun başlamadan iptal edildi.')
          : 'Herkes kendi telefonundan onaylayınca oyun başlar.'}
      </p>
      <div className={`${glassCard} divide-y divide-sep text-left`}>
        {seats.map((s) => (
          <div key={s.seat} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-l1 text-sm font-semibold">{s.name}</div>
              <div className="text-l4 text-[11px]">
                {[s.user_id === game.created_by ? 'Kuran' : null, isGroupMode ? (s.team === 1 ? group1Name : group2Name) : null]
                  .filter(Boolean).join(' · ')}
              </div>
            </div>
            <span className={`text-xs font-semibold ${
              s.invite_status === 'accepted' ? 'text-agreen' : s.invite_status === 'declined' ? 'text-ared' : 'text-ayellow'
            }`}>
              {s.invite_status === 'accepted' ? 'Onayladı' : s.invite_status === 'declined' ? 'Reddetti' : 'Bekliyor'}
            </span>
          </div>
        ))}
      </div>
      {actionError && <p className="text-ared text-xs mt-3">{actionError}</p>}
      {!isCancelled && mySeat?.invite_status === 'pending' && (
        <div className="grid grid-cols-2 gap-2 mt-5">
          <button onClick={() => handleInvite(false)} disabled={actionBusy}
            className="py-3 rounded-xl bg-s2 border border-sep text-l3 text-sm font-medium disabled:opacity-50">Reddet</button>
          <button onClick={() => handleInvite(true)} disabled={actionBusy}
            className="py-3 rounded-xl bg-ablue text-white text-sm font-bold disabled:opacity-50">Onayla</button>
        </div>
      )}
      {canCancel && (
        <button onClick={executeAbandon} disabled={actionBusy}
          className="w-full mt-5 py-3 rounded-xl bg-[var(--danger-bg)] border border-[var(--danger-border)] text-ared text-sm font-medium disabled:opacity-50">
          Oyunu iptal et
        </button>
      )}
      {homeButton}
    </>);
  }

  // ── El girişi görünümü ───────────────────────────────────────────────────────

  if (view === 'round' && canWrite) {
    const rowGrid = isGroupMode ? 'relative grid grid-cols-4 gap-1.5' : 'grid grid-cols-4 gap-2';
    const Sep = () => isGroupMode
      ? <div className="absolute inset-y-0 left-1/2 w-px bg-sep -translate-x-px pointer-events-none" />
      : null;
    const entryRoundNo = editingRoundNo ?? nextRoundNo;
    const entryDealer = rounds.find((r) => r.roundNo === entryRoundNo)?.dealerSeat ?? dealerForRound(game.first_dealer_seat, entryRoundNo);

    return (
      <div className="min-h-screen bg-s0 pb-24">
        <div className="sticky top-0 z-10 bg-s0h backdrop-blur-md border-b border-sep">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => { setView('scoreboard'); setEditingRoundNo(null); }}
              aria-label="Geri"
              className="w-9 h-9 rounded-xl bg-s2 border border-sep text-l2 flex items-center justify-center transition-colors active:scale-[0.94] touch-manipulation flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="flex-1 text-center">
              <h1 className="text-l1 font-bold text-base">Round {entryRoundNo}{editingRoundNo !== null ? ' — Düzenle' : ''}</h1>
            </div>
            <ThemeToggle />
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
          <div className={`${glassCard} overflow-hidden`}>
            {isGroupMode && (
              <div className="grid grid-cols-2 px-3 pt-3 pb-1">
                <p className="text-[10px] font-semibold text-l3 text-center uppercase tracking-widest">{group1Name}</p>
                <p className="text-[10px] font-semibold text-l3 text-center uppercase tracking-widest">{group2Name}</p>
              </div>
            )}

            <div className={`${rowGrid} px-3 ${isGroupMode ? 'pt-1' : 'pt-3'} pb-2`}>
              <Sep />
              {displayOrder.map((pi) => (
                <div key={pi} className={`rounded-lg px-1 py-2 text-center bg-s2 ${entryDealer === pi ? 'border-2 border-ablue' : 'border border-sep'}`}>
                  <div className="text-[11px] font-semibold leading-tight text-l1" style={{ wordBreak: 'break-word' }}>{names[pi]}</div>
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
                    const isDisabled = isPointInputDisabled(pi) || isHandFinish;
                    return (
                      <input
                        key={pi}
                        type="text" inputMode="decimal" pattern="^-?\d*$"
                        value={isHandFinish ? inputValues[pi] : isDisabled ? '0' : inputValues[pi]}
                        disabled={isDisabled}
                        onChange={(e) => { if (!isDisabled) handlePointChange(pi, e.target.value); }}
                        className={`w-full px-1 py-3 border rounded-xl text-center text-sm font-semibold transition-colors placeholder:text-l4 placeholder:font-normal ${isDisabled ? 'bg-s2 border-sep text-l4 cursor-not-allowed' : 'bg-s2 border-sep text-l1'}`}
                        placeholder="-" maxLength={4}
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
                      <button onClick={() => removePenalty(pi, 'individual')} disabled={playerScores[pi]?.individualPenalty === 0 || isHandFinish}
                        className="w-7 h-7 rounded-full bg-s2 border border-sep text-l2 flex items-center justify-center text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-[0.93] touch-manipulation">−</button>
                      <div className={`text-xs min-w-[22px] text-center ${playerScores[pi]?.individualPenalty ? 'text-ablue font-bold' : 'text-l3 font-semibold'}`}>
                        {playerScores[pi]?.individualPenalty || 0}
                      </div>
                      <button onClick={() => addPenalty(pi, 'individual')} disabled={isHandFinish}
                        className="w-7 h-7 rounded-full bg-s2 border border-sep text-l2 flex items-center justify-center text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-[0.93] touch-manipulation">+</button>
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
                        <button onClick={() => removePenalty(pi, 'team')} disabled={playerScores[pi]?.teamPenalty === 0 || isHandFinish}
                          className="w-7 h-7 rounded-full bg-s2 border border-sep text-l2 flex items-center justify-center text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-[0.93] touch-manipulation">−</button>
                        <div className={`text-xs min-w-[22px] text-center ${playerScores[pi]?.teamPenalty ? 'text-ablue font-bold' : 'text-l3 font-semibold'}`}>
                          {playerScores[pi]?.teamPenalty || 0}
                        </div>
                        <button onClick={() => addPenalty(pi, 'team')} disabled={isHandFinish}
                          className="w-7 h-7 rounded-full bg-s2 border border-sep text-l2 flex items-center justify-center text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-[0.93] touch-manipulation">+</button>
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
                          aria-label={`${names[pi]} ${n}. okey`}
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
                disabled={!playerScores.some(s => s.finished)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all touch-manipulation active:scale-[0.95] ${
                  isHandFinish
                    ? 'bg-ablue text-white'
                    : playerScores.some(s => s.finished)
                    ? 'bg-s2 border border-sep text-l3'
                    : 'bg-s2 border border-sep text-l4 opacity-40 cursor-not-allowed'
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
                    <span>{names[pi]}</span>
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
              {editingRoundNo !== null ? 'Değişikliği Kaydet' : 'Round\'u Kaydet'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Skor tablosu görünümü ─────────────────────────────────────────────────────

  const isOver = game.status === 'finished' || game.status === 'abandoned';
  const failedRound = sync.error ? getPendingRounds(game.id)[0]?.roundNo : undefined;

  return (
    <div className="min-h-screen bg-s0">
      <div className="sticky top-0 z-10 bg-s0h backdrop-blur-md border-b border-sep">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => router.push('/')} aria-label="Ana sayfa"><Logo size="sm" /></button>
          <div className="flex items-center gap-2">
            <span className="text-l4 text-[11px]">{isGroupMode ? 'Grup' : 'Tekli'} · {game.is_ranked ? 'dereceli' : 'derecesiz'}</span>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
        {/* Kayıt durumu */}
        {sync.error && (
          <div className="p-4 rounded-2xl bg-[var(--danger-bg)] border border-[var(--danger-border)]">
            <p className="text-ared text-sm font-semibold">Round {failedRound} kaydedilemedi</p>
            <p className="text-l2 text-xs mt-1">{sync.error}</p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={discardFailedRounds} className="py-2.5 rounded-xl bg-s2 border border-sep text-l3 text-xs font-medium">
                Vazgeç, sunucudakini al
              </button>
              <button onClick={() => failedRound && openRoundEntry(failedRound)} className="py-2.5 rounded-xl bg-ablue text-white text-xs font-bold">
                Düzelt
              </button>
            </div>
          </div>
        )}
        {!sync.error && sync.pending > 0 && sync.offline && (
          <div className="px-4 py-3 rounded-2xl bg-[var(--warn-bg)] border border-[var(--warn-border)] flex items-center justify-between gap-3">
            <p className="text-ayellow text-xs">{sync.pending} round bu telefonda bekliyor; internet gelince gönderilecek.</p>
            <button onClick={flush} className="text-ayellow text-xs font-bold flex-shrink-0">Tekrar dene</button>
          </div>
        )}
        {isOver && (
          <div className="px-4 py-3 rounded-2xl bg-s2 border border-sep flex items-center justify-between gap-3">
            <p className="text-l2 text-sm">
              {game.status === 'finished'
                ? <>Oyun bitti{game.winner_label ? <> · Kazanan: <span className="font-semibold text-l1">{game.winner_label}</span></> : ' · Berabere'}</>
                : 'Oyun yarıda bırakıldı'}
            </p>
            {game.status === 'finished' && (
              <button onClick={() => setShowResults(true)} className="text-ablue text-xs font-bold flex-shrink-0">Sonuçlar</button>
            )}
          </div>
        )}

        {/* Oyuncu Kartları */}
        <div className={`${glassCard} p-3`}>
          {isGroupMode && (
            <div className="grid grid-cols-2 px-1 pb-2">
              <p className="text-[10px] font-semibold text-l3 text-center uppercase tracking-widest">{group1Name}</p>
              <p className="text-[10px] font-semibold text-l3 text-center uppercase tracking-widest">{group2Name}</p>
            </div>
          )}
          <div className={`${isGroupMode ? 'relative ' : ''}grid grid-cols-4 gap-2`}>
            {isGroupMode && <div className="absolute inset-y-0 left-1/2 w-px bg-sep -translate-x-px pointer-events-none" />}
            {displayOrder.map((index) => (
              <div key={index} className={`rounded-xl p-2.5 text-center ${!isOver && nextDealer === index ? 'border-2 border-ablue bg-s2' : 'border bg-s2 border-sep'}`}>
                <div className="font-semibold text-xs leading-tight text-l1" style={{ wordBreak: 'break-word' }}>{names[index]}</div>
                {(showCalculation || isOver) && (
                  <div className="mt-2 pt-2 border-t border-sep">
                    <div className={`text-sm font-bold ${totalScores[index] < 0 ? 'text-agreen' : 'text-l1'}`}>
                      {totalScores[index]}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {(showCalculation || isOver) && groupScores && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[groupScores.group1, groupScores.group2].map((g, i) => (
                <div key={i} className="bg-s2 border border-sep rounded-xl px-3 py-2.5 text-center">
                  <div className="text-l3 text-[11px] font-medium truncate">{g.name}</div>
                  <div className={`text-xl font-bold mt-0.5 ${g.total < 0 ? 'text-agreen' : 'text-l1'}`}>{g.total}</div>
                </div>
              ))}
            </div>
          )}

          {(showCalculation || isOver) && rounds.length > 0 && (
            <div className="mt-2 grid grid-cols-2 divide-x divide-sep bg-s2 rounded-xl overflow-hidden">
              <div className="px-4 py-3">
                <div className="text-[10px] text-l3 uppercase tracking-widest mb-1">Önde</div>
                <div className="text-ablue font-bold text-sm truncate">{scoreDifference.leader}</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[10px] text-l3 uppercase tracking-widest mb-1">Fark</div>
                <div className="text-l1 font-bold text-sm">{scoreDifference.difference} <span className="text-l3 font-normal text-xs">puan</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Round Geçmişi */}
        <div className={`${glassCard} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-sep flex items-center justify-between">
            <h2 className="text-l3 text-xs font-medium uppercase tracking-wide">Round Geçmişi</h2>
            <span className="text-l4 text-xs">{rounds.length} round</span>
          </div>

          {rounds.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-l4 text-sm">Henüz round oynanmadı</p>
            </div>
          ) : (
            <div>
              <div className="grid gap-1 px-3 py-2 bg-s2" style={{ gridTemplateColumns: '1.5rem 1fr 1fr 1fr 1fr 2rem' }}>
                <div className="text-l4 text-[10px] text-center">#</div>
                {displayOrder.map((idx, colIdx) => (
                  <div key={idx} className={`text-[10px] text-center font-medium truncate px-0.5 text-l3 min-w-0 ${isGroupMode && colIdx === 2 ? 'border-l border-sep' : ''}`}>
                    {names[idx]}
                  </div>
                ))}
                <div />
              </div>

              {rounds.map((round) => (
                <div key={round.roundNo} className="grid gap-1 px-3 py-2 border-t border-sep hover:bg-s2 transition-colors" style={{ gridTemplateColumns: '1.5rem 1fr 1fr 1fr 1fr 2rem' }}>
                  <div className="text-l3 text-xs text-center self-center">
                    {round.roundNo}
                    {round.pending && <span className="block w-1.5 h-1.5 mx-auto mt-0.5 rounded-full bg-ayellow" title="Gönderilmeyi bekliyor" />}
                  </div>
                  {displayOrder.map((playerIndex, colIdx) => {
                    const score = round.scores[playerIndex]?.total ?? 0;
                    return (
                      <div key={playerIndex} className={`text-center self-center ${isGroupMode && colIdx === 2 ? 'border-l border-sep' : ''}`}>
                        <span className={`text-xs font-bold ${score < 0 ? 'text-agreen' : 'text-l1'}`}>{score}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-end">
                    {canWrite && (
                      <button
                        onClick={() => openRoundEntry(round.roundNo)}
                        aria-label={`Round ${round.roundNo} düzenle`}
                        className="w-6 h-6 rounded-full bg-[var(--team1-bg)] border border-[var(--team1-border)] text-ablue flex items-center justify-center transition-colors active:scale-[0.93] touch-manipulation"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Yeni Round */}
        {canWrite && (
          <div className={`${glassCard} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-l3 text-sm">Sonraki round</span>
              <span className="text-l1 font-semibold text-sm">Round {nextRoundNo}</span>
            </div>
            <button
              onClick={() => openRoundEntry(null)}
              className="w-full bg-ablue hover:opacity-90 active:scale-[0.98] text-white font-bold py-4 rounded-xl text-base transition-all touch-manipulation"
            >
              + Yeni Round Ekle
            </button>
          </div>
        )}
        {!canWrite && game.status === 'active' && (
          <p className="text-l4 text-xs text-center px-4">
            Bu oyunu izliyorsun; roundları masadaki oyuncular giriyor. Skorlar kendiliğinden güncellenir.
          </p>
        )}

        {/* Aksiyon Butonları */}
        <div className={`grid ${canWrite ? 'grid-cols-3' : 'grid-cols-2'} gap-2 pb-4`}>
          {!isOver && (
            <button
              onClick={() => setShowCalculation((v) => !v)}
              className="bg-s2 hover:opacity-90 active:scale-[0.97] border border-sep py-3.5 rounded-xl text-sm font-medium transition-all touch-manipulation flex flex-col items-center gap-1"
            >
              <ChartIcon className="w-5 h-5 text-ablue" />
              <span className="text-xs text-l2">{showCalculation ? 'Gizle' : 'Skorlar'}</span>
            </button>
          )}
          {canWrite ? (
            <>
              <button
                onClick={() => { setActionError(''); setConfirmAction('abandon'); }}
                className="bg-s2 hover:opacity-90 active:scale-[0.97] border border-sep py-3.5 rounded-xl text-sm font-medium transition-all touch-manipulation flex flex-col items-center gap-1"
              >
                <svg className="w-5 h-5 text-l3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-xs text-l3">Bırak</span>
              </button>
              <button
                onClick={() => { setActionError(''); setConfirmAction('finish'); }}
                className="bg-[var(--danger-bg)] hover:opacity-90 active:scale-[0.97] border border-[var(--danger-border)] text-ared py-3.5 rounded-xl text-sm font-medium transition-all touch-manipulation flex flex-col items-center gap-1"
              >
                <FlagIcon />
                <span className="text-xs">Bitir</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push('/')}
              className={`bg-s2 hover:opacity-90 active:scale-[0.97] border border-sep py-3.5 rounded-xl text-sm font-medium transition-all touch-manipulation ${isOver ? 'col-span-2' : ''}`}
            >
              <span className="text-xs text-l2">Ana Sayfa</span>
            </button>
          )}
        </div>
      </div>

      {/* ── MODALLER ── */}

      {/* Onay Modal */}
      {confirmAction && (
        <div className={modalBase}>
          <div className={modalCard}>
            <div className="p-6 text-center">
              <div className="flex justify-center mb-3">
                <FlagIcon className={`w-10 h-10 ${confirmAction === 'finish' ? 'text-ared' : 'text-l3'}`} />
              </div>
              <h2 className="text-l1 font-bold text-lg mb-2">
                {confirmAction === 'finish' ? 'Oyunu Bitir' : 'Oyunu Bırak'}
              </h2>
              <p className="text-l3 text-sm mb-5 leading-relaxed">
                {confirmAction === 'finish'
                  ? `Oyun ${rounds.length} round ile bitirilecek ve sonuçlar hesaplanacak.${game.is_ranked ? ' Sonuç sıralamaya işlenir.' : ''}`
                  : 'Oyun yarıda bırakılmış olarak kaydedilir; sıralamaya sayılmaz. Girilen roundlar silinmez.'}
              </p>
              <div className="bg-[var(--warn-bg)] border border-[var(--warn-border)] rounded-xl px-4 py-2.5 mb-5">
                <span className="text-ayellow text-xs">Bu işlem geri alınamaz!</span>
              </div>
              {actionError && <p className="text-ared text-xs mb-4">{actionError}</p>}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setConfirmAction(null); setActionError(''); }} disabled={actionBusy}
                  className="bg-s2 border border-sep text-l2 py-3 rounded-xl font-medium text-sm transition-colors active:scale-[0.97] touch-manipulation">İptal</button>
                <button onClick={confirmAction === 'finish' ? executeFinishGame : executeAbandon} disabled={actionBusy}
                  className="py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97] touch-manipulation bg-[var(--danger-bg)] border border-[var(--danger-border)] text-ared hover:opacity-90 disabled:opacity-50">
                  {actionBusy ? '...' : confirmAction === 'finish' ? 'Evet, Bitir' : 'Evet, Bırak'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Oyun Sonu Modal */}
      {showResults && game.status === 'finished' && results.length === 4 && (() => {
        const isTie = !game.winner_label;
        const order = isGroupMode
          ? [...results].sort((a, b) => a.place - b.place || (a.seat % 2) - (b.seat % 2) || a.seat - b.seat)
          : [...results].sort((a, b) => a.place - b.place || a.seat - b.seat);
        const cols = `3.5rem repeat(4, 1fr)`;
        const rows: { label: string; get: (r: GameResultRow) => string | number; color: (r: GameResultRow) => string }[] = [
          { label: 'Puan', get: (r) => r.final_score, color: (r) => r.final_score < 0 ? 'text-agreen' : 'text-l1' },
          { label: '*RBP', get: (r) => rounds.length ? (r.final_score / rounds.length).toFixed(1) : '—', color: (r) => r.final_score < 0 ? 'text-agreen' : 'text-l1' },
          { label: 'Okey', get: (r) => r.okey_count, color: (r) => r.okey_count ? 'text-l1' : 'text-l4' },
          { label: 'Bitiş', get: (r) => getPlayerStats(r.seat).finish, color: (r) => getPlayerStats(r.seat).finish ? 'text-agreen' : 'text-l4' },
          { label: 'Ceza', get: (r) => getPlayerStats(r.seat).penalties, color: (r) => getPlayerStats(r.seat).penalties ? 'text-l1' : 'text-l4' },
          { label: 'Beceri', get: (r) => signed(r.skill_score), color: (r) => r.skill_score > 0 ? 'text-agreen' : r.skill_score < 0 ? 'text-ared' : 'text-l3' },
        ];
        if (game.is_ranked) {
          rows.push(
            { label: 'Elo', get: (r) => r.rating_after ?? '—', color: () => 'text-l1' },
            { label: 'Değişim', get: (r) => r.rating_delta === null ? '—' : signed(r.rating_delta), color: (r) => (r.rating_delta ?? 0) > 0 ? 'text-agreen' : (r.rating_delta ?? 0) < 0 ? 'text-ared' : 'text-l3' },
          );
        }
        return (
          <div className={modalBase}>
            <div className={`${modalCard} max-w-lg`}>
              <div className="p-6">
                <div className="text-center pb-6">
                  <div className="flex justify-center mb-3">
                    {isTie ? <EqualIcon className="w-12 h-12 text-ablue" /> : <TrophyIcon className="w-12 h-12 text-ablue" />}
                  </div>
                  <p className="text-[10px] text-l3 uppercase tracking-widest mb-2">{isTie ? 'Berabere' : 'Kazanan'}</p>
                  <h2 className="text-2xl font-bold text-l1">{game.winner_label ?? 'Berabere'}</h2>
                  {!isTie && (
                    <p className="text-xs mt-2 text-l4">
                      <span className="uppercase tracking-widest">Fark</span>{' '}
                      <span className="text-l2 font-semibold">{scoreDifference.difference}</span>{' '}
                      <span>puan</span>
                    </p>
                  )}
                </div>

                {groupScores && (
                  <div className="grid grid-cols-2 gap-2 mb-6">
                    {[groupScores.group1, groupScores.group2].map((g, i) => (
                      <div key={i} className={`text-center px-4 py-3 rounded-2xl bg-s2 ${game.winner_label === g.name ? 'border-2 border-ablue' : 'border border-sep'}`}>
                        <p className="text-[11px] font-semibold text-l2 uppercase tracking-widest mb-1 truncate">{g.name}</p>
                        <p className="text-2xl font-bold text-l1">{g.total}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-2xl overflow-hidden border border-sep mb-5">
                  <div className="grid bg-s2 px-4 py-2 gap-1" style={{ gridTemplateColumns: cols }}>
                    <div />
                    {order.map((r) => (
                      <div key={r.seat} className="text-center min-w-0">
                        <div className="text-[11px] font-semibold text-l3 mb-0.5">{r.place}.</div>
                        <div className="text-[10px] font-semibold text-l2 truncate">{r.name}</div>
                      </div>
                    ))}
                  </div>
                  {rows.map((row) => (
                    <div key={row.label} className="grid border-t border-sep px-4 py-3 gap-1 items-center" style={{ gridTemplateColumns: cols }}>
                      <div className="text-[10px] text-l3 uppercase tracking-wide">{row.label}</div>
                      {order.map((r) => (
                        <div key={r.seat} className={`text-sm font-semibold text-center min-w-0 ${row.color(r)}`}>{row.get(r)}</div>
                      ))}
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-l4 -mt-3 mb-5 leading-relaxed">
                  * RBP: Round Başına Puan · Beceri: masa ortalamasına göre puan, okey şansı düşülmüş
                  {game.is_ranked ? ' · Elo: dereceli sıralama puanı' : ''}
                </p>

                <div className="space-y-2">
                  <button
                    onClick={() => router.push('/')}
                    className="w-full bg-ablue hover:opacity-90 active:scale-[0.98] text-white font-bold py-3.5 rounded-xl text-sm transition-all touch-manipulation"
                  >
                    Yeni Oyun
                  </button>
                  <button
                    onClick={() => setShowResults(false)}
                    className="w-full bg-s2 border border-sep text-l3 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.97] touch-manipulation"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
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
