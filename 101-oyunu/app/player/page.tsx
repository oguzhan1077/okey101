'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GameMode, ModeStats, PlayerStats, fetchPlayerStats } from '@/lib/gameApi';
import { nameWithTag } from '@/lib/players';
import { Badge, BADGE_LABELS } from '@/components/Badge';

const PROVISIONAL_GAMES = 10; // rating_config.provisional_games ile aynı

const fmt = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('tr-TR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const signed = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '—' : `${Number(v) > 0 ? '+' : ''}${fmt(v, digits)}`;

function StatRow({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-sep first:border-t-0">
      <div className="min-w-0">
        <div className="text-l2 text-sm">{label}</div>
        {hint && <div className="text-l4 text-[11px]">{hint}</div>}
      </div>
      <div className={`text-sm font-bold tabular-nums ${tone === 'good' ? 'text-agreen' : tone === 'bad' ? 'text-ared' : 'text-l1'}`}>{value}</div>
    </div>
  );
}

function PlayerContent() {
  const router = useRouter();
  const userId = useSearchParams().get('id');
  const [stats, setStats] = useState<PlayerStats | null | undefined>(undefined);
  const [mode, setMode] = useState<GameMode>('single');

  useEffect(() => {
    if (!userId) { setStats(null); return; }
    fetchPlayerStats(userId)
      .then((s) => {
        setStats(s);
        // Daha çok oynadığı modla aç
        if (s && (s.modes.group?.games ?? 0) > (s.modes.single?.games ?? 0)) setMode('group');
      })
      .catch(() => setStats(null));
  }, [userId]);

  const m: ModeStats | undefined = stats?.modes[mode];
  const recent = (stats?.recent ?? []).filter((g) => g.mode === mode);

  return (
    <div className="min-h-screen bg-s0">
      <div className="sticky top-0 z-10 bg-s0h backdrop-blur-md border-b border-sep">
        <div className="max-w-sm mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => (window.history.length > 1 ? router.back() : router.push('/leaderboard'))}
            aria-label="Geri"
            className="w-9 h-9 rounded-xl bg-s2 border border-sep text-l2 flex items-center justify-center active:scale-[0.94] flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="flex-1 text-center text-l1 font-bold text-base truncate">
            {stats?.display_name ? nameWithTag(stats.display_name, stats.tag) : 'Oyuncu'} <Badge badge={stats?.badge} className="w-4 h-4" />
          </h1>
          <ThemeToggle />
        </div>
      </div>

      <div className="max-w-sm mx-auto px-4 py-5">
        {stats === undefined ? (
          <p className="text-l3 text-sm text-center py-10">Yükleniyor...</p>
        ) : stats === null ? (
          <div className="text-center py-10">
            <p className="text-l2 text-sm">Oyuncu bulunamadı</p>
            <Link href="/leaderboard" className="text-ablue text-sm font-semibold mt-3 inline-block">Sıralamaya dön</Link>
          </div>
        ) : (
          <>
            {stats.badge && BADGE_LABELS[stats.badge] && (
              <div className="flex items-center justify-center gap-1.5 mb-4 text-ayellow text-xs font-semibold">
                <Badge badge={stats.badge} /> {BADGE_LABELS[stats.badge]}
              </div>
            )}
            <div className="grid grid-cols-2 gap-1 p-1 bg-s2 border border-sep rounded-2xl mb-5">
              {(['single', 'group'] as const).map((md) => (
                <button
                  key={md}
                  onClick={() => setMode(md)}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${mode === md ? 'bg-s1 text-l1 shadow-sm' : 'text-l3'}`}
                >
                  {md === 'single' ? 'Tekli' : 'Grup'}
                  <span className="text-l4 font-normal"> · {stats.modes[md]?.games ?? 0}</span>
                </button>
              ))}
            </div>

            {!m ? (
              <p className="text-l4 text-sm text-center py-10">
                Henüz bitmiş {mode === 'single' ? 'tekli' : 'grup'} oyunu yok.
              </p>
            ) : (
              <>
                {/* Özet */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-s1 border border-sep rounded-2xl px-3 py-3 text-center">
                    <div className="text-[10px] text-l3 uppercase tracking-widest">Elo</div>
                    <div className="text-xl font-black text-l1 mt-0.5 tabular-nums">{m.rating === null ? '—' : fmt(m.rating, 0)}</div>
                    <div className="text-[10px] text-l4">
                      {m.rated_games === null ? 'dereceli yok' : m.rated_games < PROVISIONAL_GAMES ? `ilk ${PROVISIONAL_GAMES} oyun: ${m.rated_games}/${PROVISIONAL_GAMES}` : `${m.rated_games} dereceli`}
                    </div>
                  </div>
                  <div className="bg-s1 border border-sep rounded-2xl px-3 py-3 text-center">
                    <div className="text-[10px] text-l3 uppercase tracking-widest">Oyun</div>
                    <div className="text-xl font-black text-l1 mt-0.5 tabular-nums">{m.games}</div>
                    <div className="text-[10px] text-l4">{m.wins} galibiyet</div>
                  </div>
                  <div className="bg-s1 border border-sep rounded-2xl px-3 py-3 text-center">
                    <div className="text-[10px] text-l3 uppercase tracking-widest">Kazanma</div>
                    <div className="text-xl font-black text-l1 mt-0.5 tabular-nums">%{fmt((100 * m.wins) / m.games, 0)}</div>
                    <div className="text-[10px] text-l4">{mode === 'single' ? `ort. ${fmt(m.avg_place, 1)}. sıra` : 'takımla'}</div>
                  </div>
                </div>

                {/* Round istatistikleri */}
                <p className="text-l3 text-xs font-semibold uppercase tracking-wider mb-2">Round başına · {m.rounds} round</p>
                <div className="bg-s1 border border-sep rounded-2xl overflow-hidden mb-4">
                  <StatRow label="Ortalama puan" value={fmt(m.avg_round_score)} hint="Düşük daha iyi" />
                  <StatRow label="Okey" value={fmt(m.okey_per_round, 2)} hint="Round başına gelen okey sayısı" />
                  <StatRow label="Bitirme oranı" value={`%${fmt(m.finish_pct)}`} />
                  <StatRow label="Elden bitirme" value={String(m.hand_finishes)} hint="Toplam" />
                  <StatRow label="Açamama oranı" value={m.not_opened_pct === null ? '—' : `%${fmt(m.not_opened_pct)}`} hint="Elden biten roundlar hariç" />
                  <StatRow label="Ceza" value={fmt(m.penalty_per_round, 2)} hint="Round başına bireysel ceza sayısı" />
                  <StatRow
                    label="Beceri"
                    value={signed(m.skill_per_round)}
                    hint="Masa ortalamasına göre, okey şansı düşülmüş"
                    tone={(m.skill_per_round ?? 0) > 0 ? 'good' : (m.skill_per_round ?? 0) < 0 ? 'bad' : undefined}
                  />
                </div>

                {/* Oyun istatistikleri */}
                <p className="text-l3 text-xs font-semibold uppercase tracking-wider mb-2">Oyun başına</p>
                <div className="bg-s1 border border-sep rounded-2xl overflow-hidden mb-4">
                  <StatRow label="Ortalama oyun skoru" value={fmt(m.avg_game_score)} />
                  <StatRow
                    label="Beceri"
                    value={signed(m.skill_per_game)}
                    tone={m.skill_per_game > 0 ? 'good' : m.skill_per_game < 0 ? 'bad' : undefined}
                  />
                  <StatRow label="Dereceli oyun" value={String(m.ranked_games)} />
                </div>

                {/* Son oyunlar */}
                {recent.length > 0 && (
                  <>
                    <p className="text-l3 text-xs font-semibold uppercase tracking-wider mb-2">Son oyunlar</p>
                    <div className="bg-s1 border border-sep rounded-2xl overflow-hidden">
                      {recent.map((g) => (
                        <Link
                          key={g.game_id}
                          href={`/game?id=${g.game_id}`}
                          className="flex items-center gap-3 px-4 py-3 border-t border-sep first:border-t-0 active:bg-s2"
                        >
                          <span className={`w-7 text-center text-sm font-bold ${g.place === 1 ? 'text-ablue' : 'text-l3'}`}>{g.place}.</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-l2 text-sm">
                              {new Date(g.ended_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                              <span className="text-l4"> · {g.round_count} round{g.is_ranked ? '' : ' · derecesiz'}</span>
                            </div>
                            <div className="text-l4 text-[11px]">{fmt(g.final_score)} puan · beceri {signed(g.skill, 0)}</div>
                          </div>
                          {g.rating_delta !== null && (
                            <span className={`text-sm font-bold tabular-nums ${g.rating_delta > 0 ? 'text-agreen' : g.rating_delta < 0 ? 'text-ared' : 'text-l3'}`}>
                              {signed(g.rating_delta, 0)}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-s0 flex items-center justify-center"><div className="text-l3 text-sm">Yükleniyor...</div></div>}>
      <PlayerContent />
    </Suspense>
  );
}
