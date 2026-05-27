'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useVenue } from '@/context/VenueContext';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const NAME_REGEX = /^[a-zA-ZğĞıİşŞüÜöÖçÇ0-9., ]*$/;

const inputBase = 'w-full px-4 py-3.5 bg-white/[0.06] border rounded-xl text-white text-base transition-colors';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, signOut } = useAuth();
  const { venue, setVenue } = useVenue();
  const [gameMode, setGameMode] = useState<'group' | 'single' | null>(null);
  const [venueLoading, setVenueLoading] = useState(false);
  const [group1Name, setGroup1Name] = useState('');
  const [group2Name, setGroup2Name] = useState('');
  const [player1, setPlayer1] = useState('');
  const [player2, setPlayer2] = useState('');
  const [player3, setPlayer3] = useState('');
  const [player4, setPlayer4] = useState('');
  const [hasOngoingGame, setHasOngoingGame] = useState(false);
  const [ongoingGameData, setOngoingGameData] = useState<any>(null);
  const [dealerIndex, setDealerIndex] = useState<number>(0);

  useEffect(() => {
    const venueSlug = searchParams.get('venue');
    if (venueSlug && !venue) {
      setVenueLoading(true);
      fetch(`/api/venues/${venueSlug}`)
        .then(res => res.json())
        .then(data => { if (!data.error) setVenue(data); })
        .catch(error => console.error('Venue yükleme hatası:', error))
        .finally(() => setVenueLoading(false));
    }
  }, [searchParams, venue, setVenue]);

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

  const handleStartGame = async () => {
    if (!canStartGame()) return;
    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venue?.id || null,
          game_mode: gameMode,
          team1_name: gameMode === 'group' ? group1Name : null,
          team2_name: gameMode === 'group' ? group2Name : null,
        }),
      });
      const game = await response.json();
      if (!response.ok) {
        console.error('Oyun kaydı oluşturulamadı:', game.error);
      } else {
        localStorage.setItem('currentGameId', game.id);
      }
    } catch (error) {
      console.error('Oyun kaydı hatası:', error);
    }
    const params = new URLSearchParams({
      mode: gameMode!,
      player1, player2, player3, player4,
      dealer: dealerIndex.toString(),
    });
    if (gameMode === 'group') {
      params.append('group1', group1Name);
      params.append('group2', group2Name);
    }
    router.push(`/game?${params.toString()}`);
  };

  const playerList = [
    { value: player1, setter: setPlayer1 },
    { value: player2, setter: setPlayer2 },
    { value: player3, setter: setPlayer3 },
    { value: player4, setter: setPlayer4 },
  ];

  const groupPlayerList = [
    { value: player1, setter: setPlayer1, team: 'sky' as const, teamLabel: group1Name || '1. Takım', pos: 1 },
    { value: player2, setter: setPlayer2, team: 'violet' as const, teamLabel: group2Name || '2. Takım', pos: 2 },
    { value: player3, setter: setPlayer3, team: 'sky' as const, teamLabel: group1Name || '1. Takım', pos: 3 },
    { value: player4, setter: setPlayer4, team: 'violet' as const, teamLabel: group2Name || '2. Takım', pos: 4 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f14] flex items-center justify-center">
        <div className="text-white/30 text-sm">Yükleniyor...</div>
      </div>
    );
  }

  /* ─── Misafir: oyun kurulum ekranı ─── */
  if (!user && gameMode !== null) {
    return (
      <div className="min-h-screen bg-[#0f0f14] px-4 pt-6 pb-10">
        <div className="max-w-sm mx-auto">
          <button
            onClick={() => setGameMode(null)}
            className="flex items-center gap-1.5 text-white/35 text-sm mb-8 hover:text-white/55 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Geri
          </button>

          <div className="mb-7">
            <h2 className="text-2xl font-bold text-white">Oyuncular</h2>
            <p className="text-white/35 text-sm mt-1">İlk dağıtacak oyuncuyu seç</p>
          </div>

          <div className="space-y-2.5 mb-8">
            {playerList.map(({ value, setter }, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="dealer"
                  checked={dealerIndex === idx}
                  onChange={() => setDealerIndex(idx)}
                  className="w-4 h-4 accent-emerald-500 flex-shrink-0"
                />
                <input
                  type="text"
                  placeholder={`Oyuncu ${idx + 1}`}
                  value={value}
                  onChange={(e) => { if (NAME_REGEX.test(e.target.value)) setter(e.target.value); }}
                  maxLength={20}
                  className={`${inputBase} border-white/[0.08]`}
                />
              </div>
            ))}
          </div>

          {hasOngoingGame && (
            <button
              onClick={handleReturnToGame}
              className="w-full mb-3 py-3.5 border border-amber-500/25 bg-amber-500/10 text-amber-400 rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all"
            >
              Devam Eden Oyuna Dön
            </button>
          )}

          <button
            onClick={handleStartGame}
            disabled={!canStartGame()}
            className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] ${
              canStartGame()
                ? 'bg-emerald-500 text-black shadow-glow-green hover:bg-emerald-400'
                : 'bg-white/[0.04] text-white/20 cursor-not-allowed border border-white/[0.06]'
            }`}
          >
            Oyunu Başlat
          </button>
        </div>
      </div>
    );
  }

  /* ─── Misafir: hoş geldin ekranı ─── */
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0f0f14] flex items-center justify-center p-5">
        <div className="w-full max-w-sm">
          {venue && (
            <div className="mb-8 text-center">
              {venue.logo_url && (
                <img src={venue.logo_url} alt={venue.name} className="h-12 mx-auto mb-2 object-contain" />
              )}
              <p className="text-white/45 text-sm font-medium">{venue.name}</p>
              {venue.welcome_message && (
                <p className="text-white/25 text-xs mt-1">{venue.welcome_message}</p>
              )}
            </div>
          )}

          <div className="text-center mb-10">
            <h1 className="text-7xl font-black text-white tracking-tight leading-none">101</h1>
            <p className="text-white/25 text-xs mt-3 tracking-[0.25em] uppercase">Skor Takip</p>
          </div>

          {hasOngoingGame && (
            <div className="mb-5 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
              <p className="text-amber-400/70 text-xs font-semibold uppercase tracking-wider mb-3">
                Devam eden oyun
              </p>
              <button
                onClick={handleReturnToGame}
                className="w-full bg-amber-500 text-black py-3 rounded-xl font-bold text-sm active:scale-[0.98] transition-transform"
              >
                Kaldığım Yerden Devam Et
              </button>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => setGameMode('single')}
              className="w-full bg-emerald-500 text-black py-4 rounded-2xl font-bold text-base shadow-glow-green hover:bg-emerald-400 active:scale-[0.98] transition-all duration-150"
            >
              Misafir Olarak Oyna
            </button>

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-white/[0.06]" />
              <span className="text-white/20 text-xs">veya</span>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>

            <Link
              href="/login"
              className="block w-full py-3.5 bg-white/[0.05] border border-white/[0.08] text-white/70 rounded-2xl font-semibold text-sm text-center hover:bg-white/[0.08] active:scale-[0.98] transition-all"
            >
              Giriş Yap
            </Link>
            <Link
              href="/register"
              className="block w-full py-3 border border-white/[0.06] text-white/35 rounded-2xl font-medium text-sm text-center hover:border-white/[0.1] hover:text-white/55 active:scale-[0.98] transition-all"
            >
              Hesap Oluştur
            </Link>
          </div>

          <p className="text-center text-white/18 text-xs mt-8 leading-relaxed">
            Hesap oluşturarak geçmişi ve istatistikleri takip edebilirsin
          </p>
        </div>
      </div>
    );
  }

  /* ─── Giriş yapılmış kullanıcı ekranı ─── */
  return (
    <div className="min-h-screen bg-[#0f0f14]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0f0f14]/90 backdrop-blur-md border-b border-white/[0.05] px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-white/30 text-xs">Hoş geldiniz</p>
          <p className="text-white/75 text-sm font-medium truncate max-w-[180px]">{user.email}</p>
        </div>
        <button
          onClick={signOut}
          className="text-white/35 text-xs px-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-lg"
        >
          Çıkış
        </button>
      </div>

      <div className="px-4 pb-10 max-w-sm mx-auto">
        {venue && (
          <div className="mt-4 p-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl flex items-center gap-3">
            {venue.logo_url && (
              <img src={venue.logo_url} alt={venue.name} className="h-8 w-8 object-contain rounded-lg" />
            )}
            <div className="min-w-0">
              <p className="text-white/75 font-medium text-sm">{venue.name}</p>
              {venue.welcome_message && (
                <p className="text-white/30 text-xs truncate">{venue.welcome_message}</p>
              )}
            </div>
          </div>
        )}

        <div className="mt-7 mb-6">
          <h1 className="text-4xl font-black text-white tracking-tight">101 Oyunu</h1>
          <p className="text-white/30 text-sm mt-1">Dijital skor takibi</p>
        </div>

        {/* Oyun Modu */}
        <div className="mb-6">
          <p className="text-white/35 text-xs font-semibold uppercase tracking-wider mb-3">Oyun Modu</p>
          <div className="grid grid-cols-2 gap-2">
            {(['single', 'group'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setGameMode(mode)}
                className={`py-4 rounded-2xl font-semibold text-sm border transition-all active:scale-[0.98] ${
                  gameMode === mode
                    ? mode === 'single'
                      ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                      : 'bg-sky-500/15 border-sky-500/35 text-sky-400'
                    : 'bg-white/[0.03] border-white/[0.07] text-white/45 hover:bg-white/[0.06]'
                }`}
              >
                <div className="text-xl mb-1">{mode === 'single' ? '🎯' : '👥'}</div>
                {mode === 'single' ? 'Tekli' : 'Grup'}
              </button>
            ))}
          </div>
        </div>

        {/* Takım İsimleri */}
        {gameMode === 'group' && (
          <div className="mb-6 space-y-2">
            <p className="text-white/35 text-xs font-semibold uppercase tracking-wider">Takım İsimleri</p>
            <input
              type="text"
              placeholder="1. Takım"
              value={group1Name}
              onChange={(e) => { if (NAME_REGEX.test(e.target.value)) setGroup1Name(e.target.value); }}
              maxLength={20}
              className={`${inputBase} border-sky-500/20`}
            />
            <input
              type="text"
              placeholder="2. Takım"
              value={group2Name}
              onChange={(e) => { if (NAME_REGEX.test(e.target.value)) setGroup2Name(e.target.value); }}
              maxLength={20}
              className={`${inputBase} border-violet-500/20`}
            />
          </div>
        )}

        {/* Oyuncular */}
        {gameMode && (
          <div className="mb-7">
            <p className="text-white/35 text-xs font-semibold uppercase tracking-wider mb-3">
              Oyuncular{' '}
              <span className="text-white/20 normal-case font-normal">— ilk dağıtacağı seç</span>
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
                        className="w-4 h-4 accent-emerald-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`text-[10px] font-semibold mb-1 ${
                          team === 'sky' ? 'text-sky-500/60' : 'text-violet-500/60'
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
                            team === 'sky' ? 'border-sky-500/20' : 'border-violet-500/20'
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
                        className="w-4 h-4 accent-emerald-500 flex-shrink-0"
                      />
                      <input
                        type="text"
                        placeholder={`Oyuncu ${idx + 1}`}
                        value={value}
                        onChange={(e) => { if (NAME_REGEX.test(e.target.value)) setter(e.target.value); }}
                        maxLength={20}
                        className={`${inputBase} border-white/[0.08] flex-1`}
                      />
                    </div>
                  ))}
            </div>
          </div>
        )}

        {hasOngoingGame && (
          <button
            onClick={handleReturnToGame}
            className="w-full mb-3 py-3.5 border border-amber-500/25 bg-amber-500/[0.08] text-amber-400 rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all"
          >
            Devam Eden Oyuna Dön
          </button>
        )}

        <button
          onClick={handleStartGame}
          disabled={!canStartGame()}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] ${
            canStartGame()
              ? 'bg-emerald-500 text-black shadow-glow-green hover:bg-emerald-400'
              : 'bg-white/[0.04] text-white/20 cursor-not-allowed border border-white/[0.05]'
          }`}
        >
          Oyunu Başlat
        </button>

        {!gameMode && (
          <p className="text-center text-white/18 text-xs mt-6 leading-relaxed px-2">
            101 oyunu 4 kişiyle oynanır. Grup modunda karşılıklı oturan oyuncular takım olur.
          </p>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0f0f14] flex items-center justify-center">
        <div className="text-white/30 text-sm">Yükleniyor...</div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
