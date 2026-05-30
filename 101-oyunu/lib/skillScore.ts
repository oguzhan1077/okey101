// ── Beceri Puanı (Skill Score) Motoru ────────────────────────────────────────
//
// Her roundda oyuncuların ham skorunu masa ortalamasına görece ölçerek
// "şans etkisini" (okey) ve "hata ağırlığını" (bireysel ceza) hesaba katar.
//
// Parametreler:
//   k  = okey katsayısı   (varsayılan 0.30)
//   W  = ceza ağırlığı    (varsayılan 75)
//
// Formül:
//   Delta S = Ortalama − Oyuncu skoru
//
//   Delta S >= 0 (başarılı): Skill = (ΔS / (1 + k × okey)) − (ceza × W)
//   Delta S <  0 (başarısız): Skill = (ΔS × (1 + k × okey)) − (ceza × W)

// ── Tipler ───────────────────────────────────────────────────────────────────

export interface SkillScoreConfig {
  /** Okey katsayısı — başarılı oyuncuda kazancı törpüler, başarısızda zararı büyütür */
  k: number;
  /** Bireysel ceza başına skill puanından düşülecek sabit ağırlık */
  W: number;
}

/** Tek bir oyuncunun o rounda ait ham giriş verisi */
export interface PlayerRoundInput {
  name: string;
  /** Nihai round skoru (points + penalty − 101 vb.) */
  total: number;
  /** Kodda 101'in katı olarak saklanır; fonksiyon içinde adede dönüştürülür */
  individualPenalty: number;
  hasOkey1: boolean;
  hasOkey2: boolean;
}

/** Tek bir round için bir oyuncunun hesaplanmış skill verisi */
export interface PlayerRoundSkill {
  name: string;
  roundScore: number;
  /** O rounddaki masa ortalaması */
  mean: number;
  /** mean − roundScore; pozitif = ortalamadan iyi */
  deltaS: number;
  okeyCount: number;
  penaltyCount: number;
  skillScore: number;
}

/** Oyun genelinde bir oyuncunun kümülatif skill verisi */
export interface PlayerGameSkill {
  name: string;
  totalSkillScore: number;
  rounds: PlayerRoundSkill[];
}

// ── Varsayılan Konfigurasyon ──────────────────────────────────────────────────

export const DEFAULT_CONFIG: SkillScoreConfig = { k: 0.30, W: 75 };

// ── Çekirdek Fonksiyonlar ─────────────────────────────────────────────────────

/**
 * Tek bir round için tüm oyuncuların skill skorlarını hesaplar.
 * Sıra duyarsızdır; oyuncuları orijinal dizin sırasıyla döndürür.
 */
export function calculateRoundSkillScores(
  players: PlayerRoundInput[],
  config: SkillScoreConfig = DEFAULT_CONFIG,
): PlayerRoundSkill[] {
  if (players.length === 0) return [];

  const { k, W } = config;

  // Masa zorluğu: bu rounddaki aritmetik ortalama
  const mean = players.reduce((sum, p) => sum + p.total, 0) / players.length;

  return players.map((player) => {
    const okeyCount = (player.hasOkey1 ? 1 : 0) + (player.hasOkey2 ? 1 : 0);

    // individualPenalty kodda 101'in katı olarak saklanır; bölüp adede çeviriyoruz
    const penaltyCount = player.individualPenalty / 101;

    const deltaS = mean - player.total;

    let skillScore: number;

    if (deltaS >= 0) {
      // Başarılı oyuncu — okey varsa masa üstünlüğünü törpüle
      skillScore = deltaS / (1 + k * okeyCount) - penaltyCount * W;
    } else {
      // Başarısız oyuncu — okey varsa zararı büyüt (şansı varken kötü oynadı)
      skillScore = deltaS * (1 + k * okeyCount) - penaltyCount * W;
    }

    return {
      name: player.name,
      roundScore: player.total,
      mean: round2(mean),
      deltaS: round2(deltaS),
      okeyCount,
      penaltyCount,
      skillScore: round2(skillScore),
    };
  });
}

/**
 * Birden fazla round üzerinden her oyuncunun toplam skill skorunu hesaplar.
 * Her round ayrı ayrı hesaplanıp toplanır; bu sayede her roundun kendi
 * masa ortalaması bağımsız olarak değerlendirilir.
 */
export function calculateGameSkillScores(
  rounds: Array<{ players: PlayerRoundInput[] }>,
  config: SkillScoreConfig = DEFAULT_CONFIG,
): PlayerGameSkill[] {
  if (rounds.length === 0) return [];

  const roundResults = rounds.map((r) => calculateRoundSkillScores(r.players, config));
  const playerCount = roundResults[0].length;

  return Array.from({ length: playerCount }, (_, i) => {
    const playerRounds = roundResults.map((result) => result[i]);
    const totalSkillScore = round2(playerRounds.reduce((sum, r) => sum + r.skillScore, 0));

    return {
      name: playerRounds[0].name,
      totalSkillScore,
      rounds: playerRounds,
    };
  });
}

// ── Yardımcı ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Mock Test ─────────────────────────────────────────────────────────────────
// Çalıştırmak için: npx ts-node 101-oyunu/lib/skillScore.ts

if (require.main === module) {
  const mockRound: PlayerRoundInput[] = [
    { name: 'Ali',   total: -101, individualPenalty: 0,   hasOkey1: true,  hasOkey2: false },
    { name: 'Ayşe',  total:   34, individualPenalty: 0,   hasOkey1: false, hasOkey2: false },
    { name: 'Can',   total:  202, individualPenalty: 101, hasOkey1: true,  hasOkey2: false },
    { name: 'Derya', total:   65, individualPenalty: 0,   hasOkey1: false, hasOkey2: false },
  ];

  // Ortalama = (-101 + 34 + 202 + 65) / 4 = 50
  // Ali:  ΔS = +151, okey=1 → 151/1.30        = +116.15
  // Ayşe: ΔS = +16,  okey=0 → 16/1.00         = +16.00
  // Can:  ΔS = -152, okey=1 → -152×1.30 − 75  = -272.60
  // Derya:ΔS = -15,  okey=0 → -15×1.00        = -15.00

  console.log('─── Round Skill Skorları ───');
  const results = calculateRoundSkillScores(mockRound);
  results.forEach((r) => {
    console.log(
      `${r.name.padEnd(6)} | skor: ${String(r.roundScore).padStart(5)} ` +
      `| ΔS: ${String(r.deltaS).padStart(7)} ` +
      `| okey: ${r.okeyCount} | ceza: ${r.penaltyCount} ` +
      `| skill: ${r.skillScore}`,
    );
  });

  console.log('\n─── Çok Roundlu Oyun Testi (aynı round 3 kez oynanmış gibi) ───');
  const gameResults = calculateGameSkillScores([
    { players: mockRound },
    { players: mockRound },
    { players: mockRound },
  ]);
  gameResults.forEach((g) => {
    console.log(`${g.name.padEnd(6)} | toplam skill: ${g.totalSkillScore}`);
  });
}
