'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PersonIcon, PeopleIcon, LogoutIcon } from '@/components/Icons';
import { Logo } from '@/components/Logo';
import Link from 'next/link';

const NAME_REGEX = /^[a-zA-ZğĞıİşŞüÜöÖçÇ0-9., ]*$/;

const inputBase = 'w-full px-4 py-3.5 bg-s2 border rounded-xl text-l1 text-base transition-colors';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, signOut } = useAuth();
  const [gameMode, setGameMode] = useState<'group' | 'single' | null>(null);
  const [group1Name, setGroup1Name] = useState('');
  const [group2Name, setGroup2Name] = useState('');
  const [player1, setPlayer1] = useState('');
  const [player2, setPlayer2] = useState('');
  const [player3, setPlayer3] = useState('');
  const [player4, setPlayer4] = useState('');
  const [hasOngoingGame, setHasOngoingGame] = useState(false);
  const [ongoingGameData, setOngoingGameData] = useState<any>(null);
  const [dealerIndex, setDealerIndex] = useState<number>(0)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => { router.prefetch('/game'); }, [router]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('roundDetails');
      const roundDetails = stored ? JSON.parse(stored) : [];
      if (roundDetails.length > 0) {
        setHasOngoingGame(true);
        setOngoingGameData(roundDetails[roundDetails.length - 1]);
      }
    } catch {
      setHasOngoingGame(false);
    }
  }, []);

  const handleReturnToGame = () => {
    if (!ongoingGameData) return;
    const mode = ongoingGameData.mode || 'single';
    const p1 = ongoingGameData.player1 || ongoingGameData.players?.[0]?.name || '';
    const p2 = ongoingGameData.player2 || ongoingGameData.players?.[1]?.name || '';
    const p3 = ongoingGameData.player3 || ongoingGameData.players?.[2]?.name || '';
    const p4 = ongoingGameData.player4 || ongoingGameData.players?.[3]?.name || '';
    const params = new URLSearchParams({ mode, player1: p1, player2: p2, player3: p3, player4: p4 });
    if (mode === 'group' && ongoingGameData.group1 && ongoingGameData.group2) {
      params.append('group1', ongoingGameData.group1);
      params.append('group2', ongoingGameData.group2);
    }
    router.push(`/game?${params.toString()}`);
  };

  const canStartGame = () => {
    if (gameMode === 'group') {
      return group1Name.trim() && group2Name.trim() && player1.trim() && player2.trim() && player3.trim() && player4.trim();
    } else if (gameMode === 'single') {
      return player1.trim() && player2.trim() && player3.trim() && player4.trim();
    }
    return false;
  };

  const handleStartGame = () => {
    if (!canStartGame() || isStarting) return;
    setIsStarting(true);

    const params = new URLSearchParams({
      mode: gameMode!,
      player1, player2, player3, player4,
      dealer: dealerIndex.toString(),
    });
    if (gameMode === 'group') {
      params.append('group1', group1Name);
      params.append('group2', group2Name);
    }

    // Hemen navigate et, API kaydını arka planda yap
    router.push(`/game?${params.toString()}`);

    fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_mode: gameMode,
        team1_name: gameMode === 'group' ? group1Name : null,
        team2_name: gameMode === 'group' ? group2Name : null,
      }),
    }).then(async (response) => {
      if (response.ok) {
        const game = await response.json();
        localStorage.setItem('currentGameId', game.id);
      }
    }).catch((error) => {
      console.error('Oyun kaydı hatası:', error);
    });
  };

  const playerList = [
    { value: player1, setter: setPlayer1 },
    { value: player2, setter: setPlayer2 },
    { value: player3, setter: setPlayer3 },
    { value: player4, setter: setPlayer4 },
  ];

  const groupPlayerList = [
    { value: player1, setter: setPlayer1, team: 'blue' as const, teamLabel: group1Name || '1. Takım', pos: 1 },
    { value: player2, setter: setPlayer2, team: 'purple' as const, teamLabel: group2Name || '2. Takım', pos: 2 },
    { value: player3, setter: setPlayer3, team: 'blue' as const, teamLabel: group1Name || '1. Takım', pos: 3 },
    { value: player4, setter: setPlayer4, team: 'purple' as const, teamLabel: group2Name || '2. Takım', pos: 4 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-s0 flex items-center justify-center">
        <div className="text-l3 text-sm">Yükleniyor...</div>
      </div>
    );
  }

  /* ─── Misafir: oyun kurulum ekranı ─── */
  if (!user && gameMode !== null) {
    return (
      <div className="min-h-screen bg-s0 px-4 pt-6 pb-10">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => setGameMode(null)}
              className="flex items-center gap-1.5 text-l3 text-sm hover:text-l2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Geri
            </button>
            <ThemeToggle />
          </div>

          <div className="mb-7">
            <h2 className="text-2xl font-bold text-l1">Oyuncular</h2>
            <p className="text-l3 text-sm mt-1">İlk dağıtacak oyuncuyu seç</p>
          </div>

          <div className="space-y-2.5 mb-8">
            {playerList.map(({ value, setter }, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="dealer"
                  checked={dealerIndex === idx}
                  onChange={() => setDealerIndex(idx)}
                  className="w-4 h-4 accent-[rgb(var(--ablue-rgb))] flex-shrink-0"
                />
                <input
                  type="text"
                  placeholder={`Oyuncu ${idx + 1}`}
                  value={value}
                  onChange={(e) => { if (NAME_REGEX.test(e.target.value)) setter(e.target.value); }}
                  maxLength={20}
                  className={`${inputBase} border-sep`}
                />
              </div>
            ))}
          </div>

          {hasOngoingGame && (
            <button
              onClick={handleReturnToGame}
              className="w-full mb-3 py-3.5 border border-[var(--warn-border)] bg-[var(--warn-bg)] text-ayellow rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all"
            >
              Devam Eden Oyuna Dön
            </button>
          )}

          <button
            onClick={handleStartGame}
            disabled={!canStartGame() || isStarting}
            className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] ${
              canStartGame() && !isStarting
                ? 'bg-ablue text-white hover:opacity-90'
                : 'bg-s2 text-l4 cursor-not-allowed border border-sep'
            }`}
          >
            {isStarting ? 'Başlatılıyor...' : 'Oyunu Başlat'}
          </button>
        </div>
      </div>
    );
  }

  /* ─── Misafir: hoş geldin ekranı ─── */
  if (!user) {
    return (
      <div className="min-h-screen bg-s0 flex items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <div className="flex justify-end mb-4">
            <ThemeToggle />
          </div>

          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <Logo size="lg" />
            </div>
            <p className="text-l4 text-xs mt-1 tracking-[0.25em] uppercase">Skor Takip</p>
          </div>

          {hasOngoingGame && (
            <div className="mb-5 p-4 bg-[var(--warn-bg)] border border-[var(--warn-border)] rounded-2xl">
              <p className="text-ayellow text-xs font-semibold uppercase tracking-wider mb-3">
                Devam eden oyun
              </p>
              <button
                onClick={handleReturnToGame}
                className="w-full bg-ayellow text-black py-3 rounded-xl font-bold text-sm active:scale-[0.98] transition-transform"
              >
                Kaldığım Yerden Devam Et
              </button>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => setGameMode('single')}
              className="w-full bg-ablue text-white py-4 rounded-2xl font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all duration-150"
            >
              Misafir Olarak Oyna
            </button>

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-sep" />
              <span className="text-l4 text-xs">veya</span>
              <div className="h-px flex-1 bg-sep" />
            </div>

            <Link
              href="/login"
              className="block w-full py-3.5 bg-s2 border border-sep text-l2 rounded-2xl font-semibold text-sm text-center hover:opacity-90 active:scale-[0.98] transition-all"
            >
              Giriş Yap
            </Link>
            <Link
              href="/register"
              className="block w-full py-3 border border-sep text-l3 rounded-2xl font-medium text-sm text-center hover:text-l2 active:scale-[0.98] transition-all"
            >
              Hesap Oluştur
            </Link>
          </div>

          <p className="text-center text-l4 text-xs mt-8 leading-relaxed">
            Hesap oluşturarak geçmişi ve istatistikleri takip edebilirsin
          </p>
        </div>
      </div>
    );
  }

  /* ─── Giriş yapılmış kullanıcı ekranı ─── */
  return (
    <div className="min-h-screen bg-s0">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-s0h backdrop-blur-md border-b border-sep px-4 py-3 flex items-center justify-between">
        <Logo size="sm" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-9 h-9 flex items-center justify-center bg-s2 border border-sep rounded-xl text-l3 transition-colors active:scale-[0.94] touch-manipulation"
          >
            <LogoutIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 pb-10 max-w-sm mx-auto">
        <div className="mt-7 mb-6">
          <h1 className="text-4xl font-black text-l1 tracking-tight">101 Oyunu</h1>
          <p className="text-l3 text-sm mt-1">Dijital skor takibi</p>
        </div>

        {/* Oyun Modu */}
        <div className="mb-6">
          <p className="text-l3 text-xs font-semibold uppercase tracking-wider mb-3">Oyun Modu</p>
          <div className="grid grid-cols-2 gap-2">
            {(['single', 'group'] as const).map((mode) => {
              const isSelected = gameMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setGameMode(mode)}
                  className={`py-4 rounded-2xl font-semibold text-sm border transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'bg-[var(--team1-bg)] border-[var(--team1-border)] text-ablue'
                      : 'bg-s2 border-sep text-l3 hover:text-l2'
                  }`}
                >
                  <div className={`flex justify-center mb-1.5 ${!isSelected ? 'text-ablue' : ''}`}>
                    {mode === 'single' ? <PersonIcon /> : <PeopleIcon />}
                  </div>
                  {mode === 'single' ? 'Tekli' : 'Grup'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Takım İsimleri */}
        {gameMode === 'group' && (
          <div className="mb-6 space-y-2">
            <p className="text-l3 text-xs font-semibold uppercase tracking-wider">Takım İsimleri</p>
            <input
              type="text"
              placeholder="1. Takım"
              value={group1Name}
              onChange={(e) => { if (NAME_REGEX.test(e.target.value)) setGroup1Name(e.target.value); }}
              maxLength={20}
              className={`${inputBase} border-[var(--team1-border)]`}
            />
            <input
              type="text"
              placeholder="2. Takım"
              value={group2Name}
              onChange={(e) => { if (NAME_REGEX.test(e.target.value)) setGroup2Name(e.target.value); }}
              maxLength={20}
              className={`${inputBase} border-[var(--team2-border)]`}
            />
          </div>
        )}

        {/* Oyuncular */}
        {gameMode && (
          <div className="mb-7">
            <p className="text-l3 text-xs font-semibold uppercase tracking-wider mb-3">
              Oyuncular{' '}
              <span className="text-l4 normal-case font-normal">— ilk dağıtacağı seç</span>
            </p>
            <div className="space-y-2">
              {gameMode === 'group'
                ? groupPlayerList.map(({ value, setter, team, teamLabel, pos }, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="dealer"
                        checked={dealerIndex === idx}
                        onChange={() => setDealerIndex(idx)}
                        className="w-4 h-4 accent-[rgb(var(--ablue-rgb))] flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`text-[10px] font-semibold mb-1 ${
                          team === 'blue' ? 'text-ablue/60' : 'text-apurple/60'
                        }`}>
                          {teamLabel}
                        </div>
                        <input
                          type="text"
                          placeholder={`Oyuncu ${pos}`}
                          value={value}
                          onChange={(e) => { if (NAME_REGEX.test(e.target.value)) setter(e.target.value); }}
                          maxLength={20}
                          className={`${inputBase} ${
                            team === 'blue' ? 'border-[var(--team1-border)]' : 'border-[var(--team2-border)]'
                          }`}
                        />
                      </div>
                    </div>
                  ))
                : playerList.map(({ value, setter }, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="dealer"
                        checked={dealerIndex === idx}
                        onChange={() => setDealerIndex(idx)}
                        className="w-4 h-4 accent-[rgb(var(--ablue-rgb))] flex-shrink-0"
                      />
                      <input
                        type="text"
                        placeholder={`Oyuncu ${idx + 1}`}
                        value={value}
                        onChange={(e) => { if (NAME_REGEX.test(e.target.value)) setter(e.target.value); }}
                        maxLength={20}
                        className={`${inputBase} border-sep flex-1`}
                      />
                    </div>
                  ))}
            </div>
          </div>
        )}

        {hasOngoingGame && (
          <button
            onClick={handleReturnToGame}
            className="w-full mb-3 py-3.5 border border-[var(--warn-border)] bg-[var(--warn-bg)] text-ayellow rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all"
          >
            Devam Eden Oyuna Dön
          </button>
        )}

        <button
          onClick={handleStartGame}
          disabled={!canStartGame() || isStarting}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] ${
            canStartGame() && !isStarting
              ? 'bg-ablue text-white hover:opacity-90'
              : 'bg-s2 text-l4 cursor-not-allowed border border-sep'
          }`}
        >
          {isStarting ? 'Başlatılıyor...' : 'Oyunu Başlat'}
        </button>

        {!gameMode && (
          <p className="text-center text-l4 text-xs mt-6 leading-relaxed px-2">
            101 oyunu 4 kişiyle oynanır. Grup modunda karşılıklı oturan oyuncular takım olur.
          </p>
        )}
      </div>

      {/* Logout Confirm Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-s1 border border-sep rounded-2xl w-full max-w-sm">
            <div className="p-6 text-center">
              <div className="flex justify-center mb-3">
                <LogoutIcon className="w-10 h-10 text-l3" />
              </div>
              <h2 className="text-l1 font-bold text-lg mb-2">Çıkış Yap</h2>
              <p className="text-l3 text-sm mb-6 leading-relaxed">Hesabınızdan çıkmak istediğinizden emin misiniz?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="bg-s2 border border-sep text-l2 py-3 rounded-xl font-medium text-sm active:scale-[0.97] touch-manipulation"
                >
                  İptal
                </button>
                <button
                  onClick={() => { setShowLogoutConfirm(false); signOut(); }}
                  className="bg-s2 border border-[var(--danger-border)] text-ared py-3 rounded-xl font-bold text-sm active:scale-[0.97] touch-manipulation"
                >
                  Çıkış Yap
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-s0 flex items-center justify-center">
        <div className="text-l3 text-sm">Yükleniyor...</div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
