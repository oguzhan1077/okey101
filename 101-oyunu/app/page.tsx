'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PersonIcon, PeopleIcon, LogoutIcon, TrophyIcon } from '@/components/Icons';
import { Logo } from '@/components/Logo';
import Link from 'next/link';
import {
  NAME_REGEX, DISPLAY_NAME_MAX, RegisteredPlayer, normalizeName, searchPlayers,
  validateDisplayName, fetchOwnDisplayName, saveOwnDisplayName,
} from '@/lib/players';
import {
  GameMode, InviteRow, ActiveGameRow, NewGamePlayer,
  createGame, respondInvite, fetchMyInvites, fetchMyActiveGames, errorText,
} from '@/lib/gameApi';

const inputBase = 'w-full px-4 py-3.5 bg-s2 border rounded-xl text-l1 text-base transition-colors';
const ACTIVE_GAME_KEY = 'activeGameId';

const modeLabel = (mode: GameMode, ranked: boolean) => `${mode === 'single' ? 'Tekli' : 'Grup'} · ${ranked ? 'dereceli' : 'derecesiz'}`;

// Oyuncular masadaki sırayla girilir: oyun yönünde (herkes sağındakine taş atar)
const seatHint = (isOwnFirst: boolean) => isOwnFirst
  ? ['Sen', 'Sağındaki', 'Karşındaki', 'Solundaki']
  : ['1. oyuncu', 'Sağındaki', 'Karşısındaki', 'Solundaki'];

function HomeContent() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const [isRanked, setIsRanked] = useState(false);
  const [group1Name, setGroup1Name] = useState('');
  const [group2Name, setGroup2Name] = useState('');
  const [playerNames, setPlayerNames] = useState(['', '', '', '']);
  const [dealerIndex, setDealerIndex] = useState(0);
  const [setupStartedAt, setSetupStartedAt] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState('');

  // Koltuk başına seçilen kayıtlı hesap (null = misafir) ve ad önerileri (sunucuda aranır, en fazla 5)
  const [playerIds, setPlayerIds] = useState<(string | null)[]>([null, null, null, null]);
  const [activeInput, setActiveInput] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<RegisteredPlayer[]>([]);
  const playerNamesRef = useRef(playerNames);
  playerNamesRef.current = playerNames;
  const playerIdsRef = useRef(playerIds);
  playerIdsRef.current = playerIds;

  // Kullanıcının kendi görünen adı
  const [ownName, setOwnName] = useState<string | null>(null);
  const [ownNameLoaded, setOwnNameLoaded] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  // Davetler ve devam eden oyunlar
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [activeGames, setActiveGames] = useState<ActiveGameRow[]>([]);
  const [guestGameId, setGuestGameId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  useEffect(() => { router.prefetch('/game'); }, [router]);

  useEffect(() => {
    try { setGuestGameId(localStorage.getItem(ACTIVE_GAME_KEY)); } catch { /* depolama kapalı */ }
    // Eski sürümün yerel oyun verisi artık kullanılmıyor
    try { localStorage.removeItem('roundDetails'); localStorage.removeItem('currentGameId'); } catch { /* yok */ }
  }, []);

  useEffect(() => {
    if (!user) {
      setOwnName(null);
      setOwnNameLoaded(false);
      setInvites([]);
      setActiveGames([]);
      return;
    }
    fetchOwnDisplayName(user.id)
      .then(setOwnName)
      .catch((error) => console.error('Görünen ad alınamadı:', error))
      .finally(() => setOwnNameLoaded(true));
  }, [user]);

  const refreshGames = useCallback(() => {
    if (!user) return;
    fetchMyInvites().then(setInvites).catch(() => {});
    fetchMyActiveGames().then(setActiveGames).catch(() => {});
  }, [user]);

  // Davetler masadakilerin telefonuna buradan düşer: sayfa açıkken düzenli kontrol
  useEffect(() => {
    if (!user) return;
    refreshGames();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refreshGames(); }, 8000);
    return () => clearInterval(timer);
  }, [user, refreshGames]);

  // Oyunu kuran kişi genelde masadadır: ilk oyuncuyu kendi adıyla doldur
  useEffect(() => {
    if (ownName && user && gameMode && !playerNames[0]) setPlayer(0, ownName, user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownName, gameMode]);

  const setPlayer = (index: number, name: string, id: string | null) => {
    setPlayerNames((prev) => prev.map((n, i) => (i === index ? name : n)));
    setPlayerIds((prev) => prev.map((x, i) => (i === index ? id : x)));
  };

  // Yazılan ad bir hesabın adıyla tam eşleşiyorsa o hesaba bağla (başka koltukta seçili değilse)
  const resolveExact = (index: number, query: string, list: RegisteredPlayer[]) => {
    if (playerNamesRef.current[index].trim() !== query) return; // bu arada ad değişti
    const exact = list.find((p) => normalizeName(p.display_name) === normalizeName(query));
    if (!exact || playerIdsRef.current.some((x, i) => i !== index && x === exact.id)) return;
    setPlayerIds((prev) => prev.map((x, i) => (i === index ? exact.id : x)));
  };

  // Yazdıkça öneri: odaktaki kutu için 200 ms bekleyip sunucuda ara
  useEffect(() => {
    if (!user || activeInput === null) { setSuggestions([]); return; }
    const query = playerNames[activeInput].trim();
    if (!query || playerIds[activeInput]) { setSuggestions([]); return; }
    const index = activeInput;
    const timer = setTimeout(() => {
      searchPlayers(query)
        .then((list) => {
          resolveExact(index, query, list);
          setSuggestions(list.filter((p) => !playerIdsRef.current.some((x, i) => i !== index && x === p.id)));
        })
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeInput, playerNames, playerIds]);

  // Kutudan çıkınca: ad yazılıp öneri seçilmediyse tam eşleşmeyi bir kez daha dene
  const handlePlayerBlur = (index: number) => {
    setActiveInput((cur) => (cur === index ? null : cur));
    const query = playerNames[index].trim();
    if (!user || !query || playerIds[index]) return;
    searchPlayers(query).then((list) => resolveExact(index, query, list)).catch(() => {});
  };

  const chooseMode = (mode: GameMode) => {
    setGameMode(mode);
    setStartError('');
    if (!setupStartedAt) setSetupStartedAt(new Date().toISOString());
  };

  const handleSaveName = async () => {
    if (!user || isSavingName) return;
    const validationError = validateDisplayName(nameInput);
    if (validationError) { setNameError(validationError); return; }
    setIsSavingName(true);
    setNameError('');
    try {
      const result = await saveOwnDisplayName(nameInput);
      if (result === 'taken') setNameError('Bu görünen ad başka bir oyuncu tarafından kullanılıyor');
      else if (result === 'invalid') setNameError('Görünen ad geçersiz');
      else {
        setOwnName(nameInput.trim());
      }
    } catch (error) {
      console.error('Görünen ad kaydedilemedi:', error);
      setNameError('Kaydedilemedi, tekrar deneyin');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleInvite = async (gameId: string, accept: boolean) => {
    setRespondingId(gameId);
    try {
      const status = await respondInvite(gameId, accept);
      if (accept && (status === 'active' || status === 'pending')) {
        router.push(`/game?id=${gameId}`);
        return;
      }
      refreshGames();
    } catch (error) {
      alert(errorText(error));
      refreshGames();
    } finally {
      setRespondingId(null);
    }
  };

  // Hesaba bağlanmayan isim misafir sayılır
  const resolvedPlayers = playerNames.map((name, i) => ({
    name: name.trim().replace(/\s+/g, ' '),
    id: user ? playerIds[i] : null,
  }));

  const hasDuplicateNames = (() => {
    const keys = resolvedPlayers.map((p) => normalizeName(p.name)).filter(Boolean);
    return new Set(keys).size !== keys.length;
  })();

  const allNamesFilled = playerNames.every((n) => n.trim());
  const teamsFilled = gameMode !== 'group' || (group1Name.trim() && group2Name.trim());
  const rankedProblem = !isRanked ? null
    : !ownName ? 'Dereceli oyun için önce görünen adını belirle'
    : resolvedPlayers.some((p) => p.name && !p.id) ? 'Dereceli oyunda 4 oyuncunun da hesabı olmalı'
    : allNamesFilled && !resolvedPlayers.some((p) => p.id === user?.id) ? 'Dereceli oyunu masadaki biri kurmalı (kendini ekle)'
    : null;

  const canStartGame = !!gameMode && allNamesFilled && !!teamsFilled && !hasDuplicateNames && !rankedProblem;

  const handleStartGame = async () => {
    if (!canStartGame || isStarting || !gameMode) return;
    setIsStarting(true);
    setStartError('');
    try {
      const players: NewGamePlayer[] = resolvedPlayers.map((p) => (p.id ? { user_id: p.id } : { guest_name: p.name }));
      const gameId = await createGame({
        mode: gameMode,
        isRanked,
        players,
        firstDealerSeat: dealerIndex,
        team1Name: group1Name.trim(),
        team2Name: group2Name.trim(),
        setupStartedAt,
      });
      try { localStorage.setItem(ACTIVE_GAME_KEY, gameId); } catch { /* depolama kapalı */ }
      router.push(`/game?id=${gameId}`);
    } catch (error) {
      console.error('Oyun kurulamadı:', error);
      setStartError(errorText(error));
      setIsStarting(false);
    }
  };

  const hints = seatHint(!!ownName && normalizeName(playerNames[0]) === normalizeName(ownName));

  const playerTag = (index: number) => {
    if (!playerNames[index].trim() || !user) return null;
    const registered = !!resolvedPlayers[index].id;
    return (
      <span className={`w-14 flex-shrink-0 text-[10px] font-semibold text-right ${registered ? 'text-agreen' : isRanked ? 'text-ared' : 'text-l4'}`}>
        {registered ? 'Kayıtlı' : 'Misafir'}
      </span>
    );
  };

  const playerRows = (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((idx) => {
        const team = gameMode === 'group' ? (idx % 2 === 0 ? 1 : 2) : null;
        const teamLabel = team === 1 ? (group1Name || '1. Takım') : (group2Name || '2. Takım');
        return (
          <div key={idx} className="flex items-center gap-3">
            <input
              type="radio"
              name="dealer"
              checked={dealerIndex === idx}
              onChange={() => setDealerIndex(idx)}
              className="w-4 h-4 accent-[rgb(var(--ablue-rgb))] flex-shrink-0"
              aria-label={`İlk dağıtan: ${idx + 1}. oyuncu`}
            />
            <div className="flex-1 min-w-0">
              <div className={`text-[10px] font-semibold mb-1 ${team === 1 ? 'text-ablue/70' : team === 2 ? 'text-apurple/70' : 'text-l4'}`}>
                {hints[idx]}{team ? ` · ${teamLabel}` : ''}
              </div>
              <div className="relative">
                <input
                  type="text"
                  autoComplete="off"
                  placeholder={`Oyuncu ${idx + 1}`}
                  value={playerNames[idx]}
                  onChange={(e) => { if (NAME_REGEX.test(e.target.value)) setPlayer(idx, e.target.value, null); }}
                  onFocus={() => setActiveInput(idx)}
                  onBlur={() => handlePlayerBlur(idx)}
                  maxLength={20}
                  className={`${inputBase} ${team === 1 ? 'border-[var(--team1-border)]' : team === 2 ? 'border-[var(--team2-border)]' : 'border-sep'}`}
                />
                {activeInput === idx && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-s1 border border-sep rounded-xl shadow-lg overflow-hidden">
                    {suggestions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        // Seçim, kutudan çıkış (blur) olayından önce işlensin
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setPlayer(idx, p.display_name, p.id); setSuggestions([]); setActiveInput(null); }}
                        className="w-full text-left px-4 py-3 text-sm text-l1 border-t border-sep first:border-t-0 active:bg-s2 hover:bg-s2"
                      >
                        {p.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {playerTag(idx)}
          </div>
        );
      })}
    </div>
  );

  const startButton = (
    <>
      {startError && <p className="text-ared text-xs mb-3 text-center">{startError}</p>}
      <button
        onClick={handleStartGame}
        disabled={!canStartGame || isStarting}
        className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] ${
          canStartGame && !isStarting
            ? 'bg-ablue text-white hover:opacity-90'
            : 'bg-s2 text-l4 cursor-not-allowed border border-sep'
        }`}
      >
        {isStarting ? 'Başlatılıyor...' : isRanked ? 'Davet Gönder' : 'Oyunu Başlat'}
      </button>
    </>
  );

  const leaderboardLink = (
    <Link
      href="/leaderboard"
      className="flex items-center justify-center gap-2 w-full py-3 bg-s2 border border-sep text-l2 rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all"
    >
      <TrophyIcon className="w-4 h-4 text-ablue" />
      Sıralama
    </Link>
  );

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
            <p className="text-l3 text-sm mt-1">Masadaki sırayla, sağa doğru gir · ilk dağıtacağı seç</p>
          </div>

          <div className="mb-8">{playerRows}</div>

          {startButton}
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

          {guestGameId && (
            <div className="mb-5 p-4 bg-[var(--warn-bg)] border border-[var(--warn-border)] rounded-2xl">
              <p className="text-ayellow text-xs font-semibold uppercase tracking-wider mb-3">
                Devam eden oyun
              </p>
              <button
                onClick={() => router.push(`/game?id=${guestGameId}`)}
                className="w-full bg-ayellow text-black py-3 rounded-xl font-bold text-sm active:scale-[0.98] transition-transform"
              >
                Kaldığım Yerden Devam Et
              </button>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => chooseMode('single')}
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
            {leaderboardLink}
          </div>

          <p className="text-center text-l4 text-xs mt-8 leading-relaxed">
            Hesap oluşturarak dereceli oyunlara katılabilir, sıralamaya girebilirsin
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
          <Link
            href="/leaderboard"
            aria-label="Sıralama"
            className="w-9 h-9 flex items-center justify-center bg-s2 border border-sep rounded-xl text-ablue transition-colors active:scale-[0.94] touch-manipulation"
          >
            <TrophyIcon className="w-4 h-4" />
          </Link>
          <ThemeToggle />
          <button
            onClick={() => setShowLogoutConfirm(true)}
            aria-label="Çıkış yap"
            className="w-9 h-9 flex items-center justify-center bg-s2 border border-sep rounded-xl text-l3 transition-colors active:scale-[0.94] touch-manipulation"
          >
            <LogoutIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 pb-10 max-w-sm mx-auto">
        <div className="mt-7 mb-6">
          <h1 className="text-4xl font-black text-l1 tracking-tight">101 Oyunu</h1>
          {ownName && user ? (
            <Link href={`/player?id=${user.id}`} className="text-l3 text-sm mt-1 inline-flex items-center gap-1">
              Merhaba {ownName} · <span className="text-ablue font-medium">İstatistiklerim</span>
            </Link>
          ) : (
            <p className="text-l3 text-sm mt-1">Dijital skor takibi</p>
          )}
        </div>

        {/* Görünen ad */}
        {ownNameLoaded && !ownName && (
          <div className="mb-6 p-4 bg-s1 border border-[var(--warn-border)] rounded-2xl">
            <p className="text-l1 text-sm font-semibold mb-1">Görünen adını belirle</p>
            <p className="text-l3 text-xs mb-3 leading-relaxed">
              Arkadaşların seni oyunlara bu adla ekler; sıralamada da bu ad görünür.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Görünen ad"
                value={nameInput}
                onChange={(e) => { if (NAME_REGEX.test(e.target.value)) setNameInput(e.target.value); }}
                maxLength={DISPLAY_NAME_MAX}
                className={`${inputBase} border-sep flex-1 min-w-0`}
              />
              <button
                onClick={handleSaveName}
                disabled={isSavingName || !nameInput.trim()}
                className="px-4 rounded-xl bg-ablue text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.97]"
              >
                {isSavingName ? '...' : 'Kaydet'}
              </button>
            </div>
            {nameError && <p className="text-ared text-xs mt-2">{nameError}</p>}
          </div>
        )}

        {/* Gelen davetler */}
        {invites.length > 0 && (
          <div className="mb-6 space-y-2">
            <p className="text-l3 text-xs font-semibold uppercase tracking-wider">Davetler</p>
            {invites.map((inv) => (
              <div key={inv.game_id} className="p-4 bg-s1 border-2 border-ablue rounded-2xl">
                <p className="text-l1 text-sm font-semibold">
                  {inv.creator_name ?? 'Biri'} seni oyuna ekledi
                </p>
                <p className="text-l3 text-xs mt-0.5">
                  {modeLabel(inv.mode, inv.is_ranked)}
                  {' · '}
                  <span className="text-ayellow font-semibold">
                    {Math.max(1, Math.ceil((new Date(inv.expires_at).getTime() - Date.now()) / 60000))} dk içinde onayla
                  </span>
                </p>
                <p className="text-l2 text-xs mt-2">{inv.players.join(' · ')}</p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    onClick={() => handleInvite(inv.game_id, false)}
                    disabled={respondingId === inv.game_id}
                    className="py-2.5 rounded-xl bg-s2 border border-sep text-l3 text-sm font-medium active:scale-[0.97] disabled:opacity-50"
                  >
                    Reddet
                  </button>
                  <button
                    onClick={() => handleInvite(inv.game_id, true)}
                    disabled={respondingId === inv.game_id}
                    className="py-2.5 rounded-xl bg-ablue text-white text-sm font-bold active:scale-[0.97] disabled:opacity-50"
                  >
                    {respondingId === inv.game_id ? '...' : 'Onayla'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Devam eden oyunlar */}
        {activeGames.length > 0 && (
          <div className="mb-6 space-y-2">
            <p className="text-l3 text-xs font-semibold uppercase tracking-wider">Devam eden oyunlar</p>
            {activeGames.map((g) => (
              <button
                key={g.game_id}
                onClick={() => router.push(`/game?id=${g.game_id}`)}
                className="w-full text-left p-4 bg-[var(--warn-bg)] border border-[var(--warn-border)] rounded-2xl active:scale-[0.98] transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-ayellow text-xs font-semibold">{modeLabel(g.mode, g.is_ranked)}</span>
                  <span className="text-l3 text-xs">{g.status === 'pending' ? 'Onay bekliyor' : `${g.round_count} el`}</span>
                </div>
                <p className="text-l1 text-sm mt-1.5">{g.players.join(' · ')}</p>
              </button>
            ))}
          </div>
        )}

        {/* Oyun Modu */}
        <div className="mb-6">
          <p className="text-l3 text-xs font-semibold uppercase tracking-wider mb-3">Oyun Modu</p>
          <div className="grid grid-cols-2 gap-2">
            {(['single', 'group'] as const).map((mode) => {
              const isSelected = gameMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => chooseMode(mode)}
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

        {/* Dereceli / derecesiz */}
        {gameMode && (
          <div className="mb-6">
            <div className="grid grid-cols-2 gap-1 p-1 bg-s2 border border-sep rounded-2xl">
              {([false, true] as const).map((ranked) => (
                <button
                  key={String(ranked)}
                  onClick={() => { setIsRanked(ranked); setStartError(''); }}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isRanked === ranked ? 'bg-s1 text-l1 shadow-sm' : 'text-l3'
                  }`}
                >
                  {ranked ? 'Dereceli' : 'Derecesiz'}
                </button>
              ))}
            </div>
            <p className="text-l4 text-xs mt-2 leading-relaxed">
              {isRanked
                ? '4 oyuncunun da hesabı olmalı. Herkes kendi telefonundan onaylayınca oyun başlar; sonuç sıralamaya işlenir.'
                : 'Sıralamaya sayılmaz. Misafir oyuncu eklenebilir; veriler yine kaydedilir.'}
              {' '}Roundları sen girersin, diğerleri kendi telefonundan izler.
            </p>
          </div>
        )}

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
            <p className="text-l3 text-xs font-semibold uppercase tracking-wider mb-1">Oyuncular</p>
            <p className="text-l4 text-xs mb-3 leading-relaxed">
              Masadaki sırayla, sağa doğru gir · ilk dağıtacağı seç
              {gameMode === 'group' && ' · takım arkadaşları karşılıklı oturur'}
            </p>
            {playerRows}
            {(hasDuplicateNames || rankedProblem) && (
              <p className="text-xs mt-3 leading-relaxed text-ared">
                {hasDuplicateNames ? 'Aynı oyuncu iki kez eklenmiş' : rankedProblem}
              </p>
            )}
          </div>
        )}

        {gameMode && startButton}

        {!gameMode && (
          <p className="text-center text-l4 text-xs mt-2 leading-relaxed px-2">
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
