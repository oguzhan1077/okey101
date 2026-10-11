import { supabase } from '@/lib/supabase';
import { gameMeta, roundMeta, newId, getDeviceId } from '@/lib/clientMeta';

// Oyun verisi: tüm yazma işlemleri veritabanı fonksiyonlarıyla (008_fresh_start.sql).
// Koltuklar (0–3) oyun yönündedir: koltuk+1 = sağdaki. Grup: 0+2 = 1. takım, 1+3 = 2. takım.

export type GameMode = 'single' | 'group';
export type GameStatus = 'pending' | 'active' | 'finished' | 'abandoned' | 'cancelled';
export type InviteStatus = 'accepted' | 'pending' | 'declined' | 'guest' | 'expired';

export interface GameInfo {
  id: string;
  mode: GameMode;
  is_ranked: boolean;
  status: GameStatus;
  created_by: string | null;
  team1_name: string | null;
  team2_name: string | null;
  first_dealer_seat: number;
  round_count: number;
  started_at: string | null;
  winner_label: string | null;
  created_at: string;
  end_reason: 'completed' | 'abandoned' | 'declined' | 'cancelled' | 'expired' | null;
}

export interface SeatInfo {
  seat: number;
  team: number | null;
  user_id: string | null;
  name: string;
  invite_status: InviteStatus;
  badge?: string | null;  // hesabın rozeti (misafirde yok)
}

export interface SeatScore {
  points: number;
  individualPenalty: number;
  teamPenalty: number;
  okey1: boolean;
  okey2: boolean;
  finished: boolean;
  handFinished: boolean;
  total: number;
}

export interface RoundRecord {
  roundNo: number;
  dealerSeat: number | null;
  revision: number;        // sunucudaki sürüm (0 = henüz sunucuda yok)
  scores: SeatScore[];     // koltuk sırasıyla
  pending?: boolean;       // cihazda bekliyor, sunucuya gitmedi
}

export interface GameResultRow {
  seat: number;
  name: string;
  final_score: number;
  place: number;
  okey_count: number;
  raw_diff: number;
  okey_luck: number;
  skill_score: number;
  rating_before: number | null;
  rating_after: number | null;
  rating_delta: number | null;
}

export interface LoadedGame {
  game: GameInfo;
  seats: SeatInfo[];
  rounds: RoundRecord[];
  results: GameResultRow[];
  inviteExpiresAt: string | null;  // onay bekleyen oyunda davetlerin süresinin dolacağı an
}

export const emptySeatScore = (): SeatScore => ({
  points: 0, individualPenalty: 0, teamPenalty: 0,
  okey1: false, okey2: false, finished: false, handFinished: false, total: 0,
});

export const dealerForRound = (firstDealerSeat: number, roundNo: number) => (firstDealerSeat + roundNo - 1) % 4;

function db() {
  if (!supabase) throw new Error('Sunucuya bağlanılamıyor');
  return supabase;
}

/** Sunucu hata mesajını kullanıcıya gösterilecek hale getirir */
export function errorText(error: unknown): string {
  const message = (error as { message?: string })?.message || 'Bilinmeyen hata';
  return message.replace(/^ROUND_CONFLICT:\s*/, '');
}

/** Bağlantı kaynaklı (tekrar denenebilir) hata mı? Veritabanının reddettiği kayıtlar değildir. */
function isTransient(error: { code?: string; message?: string }): boolean {
  if (!error.code) return true;
  if (error.code.startsWith('PGRST3') || error.code.startsWith('08')) return true;
  return /fetch|network|timeout/i.test(error.message || '');
}

// ── Okuma ─────────────────────────────────────────────────────────────────────

interface RoundRow { round_no: number; dealer_seat: number | null; revision: number }
interface ScoreRow {
  round_no: number; seat: number; points: number; individual_penalty: number; team_penalty: number;
  okey1: boolean; okey2: boolean; finished: boolean; hand_finished: boolean; total: number;
}
interface ResultRow {
  seat: number; final_score: number; place: number; okey_count: number; raw_diff: number; okey_luck: number;
  skill_score: number; rating_before: number | null; rating_after: number | null;
}

/**
 * Oyunun tamamı tek istekte. Oyun verisi gizli: sadece oyuncular, kuran ve (misafir oyununda)
 * kuran cihaz görebilir. Görme yetkisi yoksa ya da oyun yoksa null döner.
 */
export async function loadGame(gameId: string): Promise<LoadedGame | null> {
  const { data, error } = await db().rpc('get_game', { p_game_id: gameId, p_device_id: getDeviceId() });
  if (error) throw error;
  if (!data) return null;
  const g = data.game as GameInfo & { invite_expires_at: string | null };
  const seats = (data.players ?? []) as SeatInfo[];
  const r = { data: (data.rounds ?? []) as RoundRow[] };
  const s = { data: (data.scores ?? []) as ScoreRow[] };
  const res = { data: (data.results ?? []) as ResultRow[] };
  const inviteExpiresAt = g.invite_expires_at;

  const scoresByRound = new Map<number, SeatScore[]>();
  for (const row of s.data ?? []) {
    const list = scoresByRound.get(row.round_no) ?? [];
    list[row.seat] = {
      points: Number(row.points),
      individualPenalty: Number(row.individual_penalty),
      teamPenalty: Number(row.team_penalty),
      okey1: row.okey1,
      okey2: row.okey2,
      finished: row.finished,
      handFinished: row.hand_finished,
      total: Number(row.total),
    };
    scoresByRound.set(row.round_no, list);
  }
  const rounds: RoundRecord[] = (r.data ?? []).map((row) => ({
    roundNo: row.round_no,
    dealerSeat: row.dealer_seat,
    revision: row.revision,
    scores: scoresByRound.get(row.round_no) ?? [],
  }));

  const results: GameResultRow[] = (res.data ?? []).map((row) => {
    const before = row.rating_before === null ? null : Number(row.rating_before);
    const after = row.rating_after === null ? null : Number(row.rating_after);
    return {
      seat: row.seat,
      name: seats[row.seat]?.name ?? '',
      final_score: Number(row.final_score),
      place: row.place,
      okey_count: row.okey_count,
      raw_diff: Math.round(Number(row.raw_diff)),
      okey_luck: Math.round(Number(row.okey_luck)),
      skill_score: Math.round(Number(row.skill_score)),
      rating_before: before === null ? null : Math.round(before),
      rating_after: after === null ? null : Math.round(after),
      rating_delta: before === null || after === null ? null : Math.round((after - before) * 10) / 10,
    };
  });

  return { game: g as GameInfo, seats, rounds, results, inviteExpiresAt };
}

export interface InviteRow {
  game_id: string;
  mode: GameMode;
  is_ranked: boolean;
  creator_name: string | null;
  creator_badge?: string | null;
  players: string[];
  player_badges?: (string | null)[];  // players ile aynı sırada
  created_at: string;
  expires_at: string;
}

export async function fetchMyInvites(): Promise<InviteRow[]> {
  const { data, error } = await db().rpc('my_invites');
  if (error) throw error;
  return (data ?? []) as InviteRow[];
}

export interface ActiveGameRow {
  game_id: string;
  mode: GameMode;
  is_ranked: boolean;
  status: GameStatus;
  players: string[];
  player_badges?: (string | null)[];  // players ile aynı sırada
  round_count: number;
  created_at: string;
}

export async function fetchMyActiveGames(): Promise<ActiveGameRow[]> {
  const { data, error } = await db().rpc('my_active_games');
  if (error) throw error;
  return (data ?? []) as ActiveGameRow[];
}

export interface LeaderboardRow {
  user_id: string;
  display_name: string;
  tag: number | null;
  badge: string | null;
  rating: number;
  games_played: number;
}

export const LEADERBOARD_PAGE_SIZE = 10;

export interface LeaderboardPage {
  rows: (LeaderboardRow & { rank: number })[];
  total: number;
}

export async function fetchLeaderboardPage(mode: GameMode, page: number): Promise<LeaderboardPage> {
  const { data, error } = await db().rpc('get_leaderboard_page', {
    p_mode: mode, p_limit: LEADERBOARD_PAGE_SIZE, p_offset: page * LEADERBOARD_PAGE_SIZE,
  });
  if (error) throw error;
  const rows = (data ?? []) as (LeaderboardRow & { rank: number; total_count: number })[];
  return {
    rows: rows.map((r) => ({ ...r, rank: Number(r.rank), rating: Number(r.rating) })),
    total: rows.length ? Number(rows[0].total_count) : 0,
  };
}

/** Oyuncunun sıralamadaki yeri (1'den başlar); sıralamada yoksa null */
export async function fetchPlayerRank(mode: GameMode, userId: string): Promise<number | null> {
  const { data, error } = await db().rpc('get_player_rank', { p_mode: mode, p_user_id: userId });
  if (error) throw error;
  return data === null ? null : Number(data);
}

export interface ModeStats {
  games: number;
  ranked_games: number;
  wins: number;
  avg_place: number;
  avg_game_score: number;
  skill_per_game: number;
  rounds: number;
  avg_round_score: number;
  okey_per_round: number;
  finish_pct: number;
  hand_finishes: number;
  not_opened_pct: number | null;
  penalty_per_round: number;
  skill_per_round: number | null;
  rating: number | null;
  rated_games: number | null;
}

// Kendi profilinde: tarihli, hepsi açılabilir. Başkasının profilinde: tarihsiz özet;
// sadece birlikte oynanan oyunun numarası gelir (can_open).
export interface RecentGame {
  game_id: string | null;
  can_open: boolean;
  mode: GameMode;
  is_ranked: boolean;
  ended_at: string | null;
  round_count: number;
  place: number;
  final_score: number;
  skill: number;
  rating_delta: number | null;
}

export interface PlayerStats {
  user_id: string;
  display_name: string | null;
  tag: number | null;
  badge: string | null;
  modes: Partial<Record<GameMode, ModeStats>>;
  baseline: Partial<Record<GameMode, ModeBaseline>>;  // o moddaki tüm bitmiş oyunların genel ortalaması
  recent: RecentGame[];
}

export interface ModeBaseline {
  avg_round_score: number;
  okey_per_round: number;
  finish_pct: number;
  not_opened_pct: number | null;
  penalty_per_round: number;
  avg_game_score: number;
  win_pct: number;
}

/** Profil istatistiklerinin süzgeci; Elo her zaman dereceli oyunlardan gelir */
export type StatsKind = 'ranked' | 'unranked' | 'all';

export async function fetchPlayerStats(userId: string, kind: StatsKind = 'all'): Promise<PlayerStats | null> {
  const { data, error } = await db().rpc('get_player_stats', { p_user_id: userId, p_kind: kind });
  if (error) throw error;
  return (data ?? null) as PlayerStats | null;
}

// ── Oyun kurma, davet, bitirme ────────────────────────────────────────────────

export type NewGamePlayer = { user_id: string } | { guest_name: string };

export async function createGame(params: {
  mode: GameMode;
  isRanked: boolean;
  players: NewGamePlayer[];
  firstDealerSeat: number;
  team1Name?: string;
  team2Name?: string;
  setupStartedAt: string | null;
}): Promise<string> {
  const { data, error } = await db().rpc('create_game', {
    p_mode: params.mode,
    p_is_ranked: params.isRanked,
    p_players: params.players,
    p_first_dealer_seat: params.firstDealerSeat,
    p_team1_name: params.mode === 'group' ? params.team1Name ?? null : null,
    p_team2_name: params.mode === 'group' ? params.team2Name ?? null : null,
    p_meta: gameMeta(params.setupStartedAt),
  });
  if (error) throw error;
  return data as string;
}

export async function respondInvite(gameId: string, accept: boolean): Promise<GameStatus> {
  const { data, error } = await db().rpc('respond_invite', { p_game_id: gameId, p_accept: accept });
  if (error) throw error;
  return data as GameStatus;
}

/** Onay beklerken iptal / oynanırken yarıda bırakma */
export async function endGameEarly(gameId: string): Promise<GameStatus> {
  const { data, error } = await db().rpc('end_game_early', { p_game_id: gameId, p_device_id: getDeviceId() });
  if (error) throw error;
  return data as GameStatus;
}

export interface FinishResult {
  winner: string | null;
  okey_values: { single: number; double: number };
  players: GameResultRow[];
}

export async function finishGame(gameId: string): Promise<FinishResult> {
  const { data, error } = await db().rpc('finish_game', { p_game_id: gameId, p_device_id: getDeviceId() });
  if (error) throw error;
  return data as FinishResult;
}

// ── El kaydı: önce cihazdaki kuyruğa, sonra sunucuya ──────────────────────────
// İnternet kesilse de el kaybolmaz; sunucu aynı içeriğin tekrar gönderilmesini güvenle yok sayar.

interface PendingRound {
  id: string;              // kuyruk kaydının kimliği (her giriş/düzeltme yeni kimlik alır)
  roundNo: number;
  dealerSeat: number | null;
  scores: SeatScore[];
  baseRevision: number;    // sunucudaki sürüm (0 = yeni el)
  clientTime: string;
  entryStartedAt: string | null;
  error?: string;          // sunucu reddetti; kullanıcı düzeltmeli veya vazgeçmeli
}

const queueKey = (gameId: string) => `pendingRounds:${gameId}`;

export function getPendingRounds(gameId: string): PendingRound[] {
  try {
    return JSON.parse(localStorage.getItem(queueKey(gameId)) || '[]');
  } catch {
    return [];
  }
}

function setPendingRounds(gameId: string, list: PendingRound[]) {
  try {
    if (list.length) localStorage.setItem(queueKey(gameId), JSON.stringify(list));
    else localStorage.removeItem(queueKey(gameId));
  } catch {
    // Depolama kapalıysa kuyruk sadece bellekte kalır; flush yine dener
  }
}

export function enqueueRound(gameId: string, round: Omit<PendingRound, 'id' | 'error'>) {
  const list = getPendingRounds(gameId);
  const item: PendingRound = { ...round, id: newId() };
  const existing = list.findIndex((p) => p.roundNo === round.roundNo);
  if (existing >= 0) {
    // Henüz gönderilmemiş eli düzeltme: sunucudaki sürüm aynı; yeni elde ilk giriş zamanları korunur
    const prev = list[existing];
    item.baseRevision = prev.baseRevision;
    if (prev.baseRevision === 0) {
      item.clientTime = prev.clientTime;
      item.entryStartedAt = prev.entryStartedAt;
    }
    list[existing] = item;
  } else {
    list.push(item);
  }
  setPendingRounds(gameId, list);
}

export function discardPendingRounds(gameId: string) {
  setPendingRounds(gameId, []);
}

/** Bekleyen elleri sunucudakilerin üzerine uygular (ekranda gösterim için) */
export function mergePending(gameId: string, rounds: RoundRecord[]): RoundRecord[] {
  const merged = [...rounds];
  for (const p of getPendingRounds(gameId)) {
    const rec: RoundRecord = { roundNo: p.roundNo, dealerSeat: p.dealerSeat, revision: p.baseRevision, scores: p.scores, pending: true };
    const i = merged.findIndex((r) => r.roundNo === p.roundNo);
    if (i >= 0) merged[i] = rec;
    else merged.push(rec);
  }
  return merged.sort((a, b) => a.roundNo - b.roundNo);
}

export interface SyncState {
  pending: number;
  error: string | null;    // sunucunun reddettiği el (kuyruk durdu)
  offline: boolean;        // bağlantı yok, sonra tekrar denenecek
}

const flushing = new Map<string, Promise<SyncState>>();
const SAVE_TIMEOUT_MS = 20000;
const MAX_ROUNDS_PER_FLUSH = 50;   // döngünün her durumda bitmesi için üst sınır
const STORAGE_ERROR = 'Tarayıcı hafızasına yazılamıyor; sayfayı yenileyip tekrar dene';

const TIMEOUT = Symbol('timeout');
const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T | typeof TIMEOUT> =>
  Promise.race([p, new Promise<typeof TIMEOUT>((resolve) => setTimeout(() => resolve(TIMEOUT), ms))]);

async function runFlush(gameId: string): Promise<SyncState> {
  try {
    for (let sent = 0; sent < MAX_ROUNDS_PER_FLUSH; sent++) {
      const list = getPendingRounds(gameId);
      if (!list.length) return { pending: 0, error: null, offline: false };
      const item = list[0];
      const response = await withTimeout(db().rpc('save_round', {
        p_game_id: gameId,
        p_round_no: item.roundNo,
        p_dealer_seat: item.dealerSeat,
        p_scores: item.scores.map((s) => ({
          points: s.points,
          individual_penalty: s.individualPenalty,
          team_penalty: s.teamPenalty,
          okey1: s.okey1,
          okey2: s.okey2,
          finished: s.finished,
          hand_finished: s.handFinished,
          total: s.total,
        })),
        p_client_time: item.clientTime,
        p_meta: roundMeta(item.entryStartedAt),
        p_base_revision: item.baseRevision,
      }), SAVE_TIMEOUT_MS);
      // Cevap gelmedi: tekrar denenecek (sunucu aynı içeriği ikinci kez yazmaz)
      if (response === TIMEOUT) return { pending: list.length, error: null, offline: true };

      const { data, error } = response;
      const current = getPendingRounds(gameId);
      if (error) {
        if (isTransient(error)) return { pending: current.length, error: null, offline: true };
        const message = errorText(error);
        for (const p of current) if (p.id === item.id) p.error = message;
        setPendingRounds(gameId, current);
        return { pending: current.length, error: message, offline: false };
      }
      // Gönderilirken aynı el tekrar düzeltildiyse o düzeltme kuyrukta kalır ve yeni sürümü bilmeli
      const rest = current.filter((p) => p.id !== item.id);
      for (const p of rest) if (p.roundNo === item.roundNo) p.baseRevision = data as number;
      setPendingRounds(gameId, rest);
      // Hafızaya yazılamadıysa gönderilen el kuyrukta kalır; aynı eli tekrar tekrar göndermemek için dur
      const after = getPendingRounds(gameId);
      if (after.some((p) => p.id === item.id)) return { pending: after.length, error: STORAGE_ERROR, offline: false };
    }
    return { pending: getPendingRounds(gameId).length, error: null, offline: true };
  } catch {
    return { pending: getPendingRounds(gameId).length, error: null, offline: true };
  }
}

/** Bekleyen elleri sırayla gönderir. Aynı anda tek gönderim çalışır; diğer çağrılar onu bekler. */
export function flushPendingRounds(gameId: string): Promise<SyncState> {
  const running = flushing.get(gameId);
  if (running) return running;
  // Kilit, iş bittikten SONRA kaldırılır (.finally her zaman set'ten sonra çalışır)
  const job = runFlush(gameId).finally(() => {
    if (flushing.get(gameId) === job) flushing.delete(gameId);
  });
  flushing.set(gameId, job);
  return job;
}
