'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TrophyIcon } from '@/components/Icons';
import { GameMode, LeaderboardRow, fetchLeaderboard } from '@/lib/gameApi';

const PROVISIONAL_GAMES = 10; // rating_config.provisional_games ile aynı

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<GameMode>('single');
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setRows(null);
    setError(false);
    fetchLeaderboard(mode).then(setRows).catch(() => setError(true));
  }, [mode]);

  return (
    <div className="min-h-screen bg-s0">
      <div className="sticky top-0 z-10 bg-s0h backdrop-blur-md border-b border-sep">
        <div className="max-w-sm mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            aria-label="Ana sayfa"
            className="w-9 h-9 rounded-xl bg-s2 border border-sep text-l2 flex items-center justify-center active:scale-[0.94] flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="flex-1 text-center text-l1 font-bold text-base">Sıralama</h1>
          <ThemeToggle />
        </div>
      </div>

      <div className="max-w-sm mx-auto px-4 py-5">
        <div className="grid grid-cols-2 gap-1 p-1 bg-s2 border border-sep rounded-2xl mb-5">
          {(['single', 'group'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${mode === m ? 'bg-s1 text-l1 shadow-sm' : 'text-l3'}`}
            >
              {m === 'single' ? 'Tekli' : 'Grup'}
            </button>
          ))}
        </div>

        {error ? (
          <p className="text-ared text-sm text-center py-10">Sıralama yüklenemedi</p>
        ) : rows === null ? (
          <p className="text-l3 text-sm text-center py-10">Yükleniyor...</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-12">
            <TrophyIcon className="w-10 h-10 text-l4 mx-auto mb-3" />
            <p className="text-l2 text-sm font-semibold">Henüz dereceli oyun yok</p>
            <p className="text-l4 text-xs mt-1">İlk dereceli {mode === 'single' ? 'tekli' : 'grup'} oyun bitince burada görünecek.</p>
          </div>
        ) : (
          <div className="bg-s1 border border-sep rounded-2xl overflow-hidden">
            {rows.map((r, i) => {
              const isMe = user?.id === r.user_id;
              return (
                <Link
                  key={r.user_id}
                  href={`/player?id=${r.user_id}`}
                  className={`flex items-center gap-3 px-4 py-3 active:bg-s2 ${i ? 'border-t border-sep' : ''} ${isMe ? 'bg-[var(--team1-bg)]' : ''}`}
                >
                  <span className={`w-6 text-center text-sm font-bold ${i < 3 ? 'text-ablue' : 'text-l3'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-l1 text-sm font-semibold truncate">{r.display_name}</div>
                    <div className="text-l4 text-[11px]">
                      {r.games_played} oyun{r.games_played < PROVISIONAL_GAMES ? ' · yerleşiyor' : ''}
                    </div>
                  </div>
                  <span className="text-l1 text-base font-bold tabular-nums">{Math.round(r.rating)}</span>
                  <svg className="w-4 h-4 text-l4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}

        <p className="text-l4 text-xs mt-5 leading-relaxed">
          Herkes 1500 puanla başlar; puan 100'ün altına inmez. Sadece 4 oyuncunun da onayladığı dereceli oyunlar sayılır.
          Puan, okey şansı düşülmüş beceriye göre değişir. İlk {PROVISIONAL_GAMES} oyunda daha hızlı, 2000 ve 2400 üstünde daha yavaş değişir.
          Oyuncuya dokunarak istatistiklerini görebilirsin.
        </p>
      </div>
    </div>
  );
}
