// localStorage oyun verilerini yönetme utility'leri

interface StoredGame {
  roundDetails: any[];
  gameId: string;
  timestamp: number;
  expiresAt: number;
}

// Oyun verilerinin ne kadar saklanacağı (milisaniye)
const STORAGE_DURATION = {
  HOURS_24: 24 * 60 * 60 * 1000,      // 24 saat
  HOURS_48: 48 * 60 * 60 * 1000,      // 48 saat
  DAYS_7: 7 * 24 * 60 * 60 * 1000,    // 7 gün
  DAYS_30: 30 * 24 * 60 * 60 * 1000,  // 30 gün
};

// Varsayılan saklama süresi: 7 gün
const DEFAULT_DURATION = STORAGE_DURATION.DAYS_7;

/**
 * Oyun verilerini kaydet (timestamp ile)
 */
export function saveGameData(roundDetails: any[], gameId: string | null) {
  const now = Date.now();
  const data: StoredGame = {
    roundDetails,
    gameId: gameId || '',
    timestamp: now,
    expiresAt: now + DEFAULT_DURATION,
  };
  
  localStorage.setItem('gameData', JSON.stringify(data));
  
  // Backward compatibility için eski key'leri de tut
  localStorage.setItem('roundDetails', JSON.stringify(roundDetails));
  if (gameId) {
    localStorage.setItem('currentGameId', gameId);
  }
}

/**
 * Oyun verilerini yükle (süre kontrolü ile)
 */
export function loadGameData(): { roundDetails: any[]; gameId: string | null } | null {
  try {
    // Önce yeni formattan dene
    const stored = localStorage.getItem('gameData');
    if (stored) {
      const data: StoredGame = JSON.parse(stored);
      
      // Süre kontrolü
      if (Date.now() > data.expiresAt) {
        // Süresi dolmuş, temizle
        clearGameData();
        return null;
      }
      
      return {
        roundDetails: data.roundDetails,
        gameId: data.gameId || null,
      };
    }
    
    // Eski format için fallback
    const roundDetails = localStorage.getItem('roundDetails');
    const gameId = localStorage.getItem('currentGameId');
    
    if (roundDetails) {
      return {
        roundDetails: JSON.parse(roundDetails),
        gameId: gameId,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Game data load error:', error);
    return null;
  }
}

/**
 * Oyun verilerini temizle
 */
export function clearGameData() {
  localStorage.removeItem('gameData');
  localStorage.removeItem('roundDetails');
  localStorage.removeItem('currentGameId');
}

/**
 * Venue bilgisini temizle
 */
export function clearVenueData() {
  localStorage.removeItem('currentVenue');
}

/**
 * Kalan süreyi göster (dakika)
 */
export function getRemainingTime(): number | null {
  try {
    const stored = localStorage.getItem('gameData');
    if (!stored) return null;
    
    const data: StoredGame = JSON.parse(stored);
    const remaining = data.expiresAt - Date.now();
    
    return remaining > 0 ? Math.floor(remaining / 60000) : 0; // dakika
  } catch {
    return null;
  }
}

/**
 * Oyun verilerinin var olup olmadığını kontrol et
 */
export function hasGameData(): boolean {
  const data = loadGameData();
  return data !== null && data.roundDetails.length > 0;
}

/**
 * Tüm eski/süresi dolmuş oyunları temizle
 */
export function cleanupExpiredGames() {
  const data = loadGameData();
  if (!data) {
    clearGameData(); // Null ise temizle
  }
}

