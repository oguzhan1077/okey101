import { supabase } from '@/lib/supabase';
import { gameMeta, roundMeta } from '@/lib/clientMeta';

// Oyun verisi: tüm yazma işlemleri veritabanı fonksiyonlarıyla (008_fresh_start.sql).
// Koltuklar (0–3) oyun yönündedir: koltuk+1 = sağdaki. Grup: 0+2 = 1. takım, 1+3 = 2. takım.

export type GameMode = 'single' | 'group';
export type GameStatus = 'pending' | 'active' | 'finished' | 'abandoned' | 'cancelled';
export type InviteStatus = 'accepted' | 'pending' | 'declined' | 'guest';

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
}

export interface SeatInfo {
  seat: number;
  team: number | null;
  user_id: string | null;
  name: string;
  invite_status: InviteStatus;
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

export async function loadGame(gameId: string): Promise<LoadedGame | null> {
  const client = db();
  const [g, p, r, s, res] = await Promise.all([
    client.from('games')
      .select('id, mode, is_ranked, status, created_by, team1_name, team2_name, first_dealer_seat, round_count, started_at, winner_label')
      .eq('id', gameId).maybeSingle(),
    client.from('game_players').select('seat, team, user_id, name, invite_status').eq('game_id', gameId).order('seat'),
    client.from('rounds').select('round_no, dealer_seat, revision').eq('game_id', gameId).order('round_no'),
    client.from('round_scores')
      .select('round_no, seat, points, individual_penalty, team_penalty, okey1, okey2, finished, hand_finished, total')
      .eq('game_id', gameId).order('round_no').order('seat'),
    client.from('game_results')
      .select('seat, final_score, place, okey_count, raw_diff, okey_luck, skill_score, rating_before, rating_after')
      .eq('game_id', gameId).order('seat'),
  ]);
  for (const q of [g, p, r, s, res]) if (q.error) throw q.error;
  if (!g.data) return null;

  const seats = (p.data ?? []) as SeatInfo[];
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

  return { game: g.data as GameInfo, seats, rounds, results };
}

export interface InviteRow {
  game_id: string;
  mode: GameMode;
  is_ranked: boolean;
  creator_name: string | null;
  players: string[];
  created_at: string;
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
  rating: number;
  games_played: number;
}

export async function fetchLeaderboard(mode: GameMode): Promise<LeaderboardRow[]> {
  const { data, error } = await db().rpc('get_leaderboard', { p_mode: mode });
  if (error) throw error;
  return ((data ?? []) as LeaderboardRow[]).map((r) => ({ ...r, rating: Number(r.rating) }));
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
  const { data, error } = await db().rpc('end_game_early', { p_game_id: gameId });
  if (error) throw error;
  return data as GameStatus;
}

export interface FinishResult {
  winner: string | null;
  okey_values: { single: number; double: number };
  players: GameResultRow[];
}

export async function finishGame(gameId: string): Promise<FinishResult> {
  const { data, error } = await db().rpc('finish_game', { p_game_id: gameId });
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
  const item: PendingRound = { ...round, id: crypto.randomUUID() };
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

export function flushPendingRounds(gameId: string): Promise<SyncState> {
  const running = flushing.get(gameId);
  if (running) return running;
  const job = (async (): Promise<SyncState> => {
    try {
      for (;;) {
        const list = getPendingRounds(gameId);
        if (!list.length) return { pending: 0, error: null, offline: false };
        const item = list[0];
        const { data, error } = await db().rpc('save_round', {
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
        });
        if (error) {
          if (isTransient(error)) return { pending: list.length, error: null, offline: true };
          item.error = errorText(error);
          setPendingRounds(gameId, list);
          return { pending: list.length, error: item.error, offline: false };
        }
        // Gönderilirken aynı el tekrar düzeltildiyse o düzeltme kuyrukta kalır ve yeni sürümü bilmeli
        const rest = getPendingRounds(gameId).filter((p) => p.id !== item.id);
        for (const p of rest) if (p.roundNo === item.roundNo) p.baseRevision = data as number;
        setPendingRounds(gameId, rest);
      }
    } catch {
      const list = getPendingRounds(gameId);
      return { pending: list.length, error: null, offline: true };
    } finally {
      flushing.delete(gameId);
    }
  })();
  flushing.set(gameId, job);
  return job;
}
