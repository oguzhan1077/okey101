// Kayıtlara otomatik eklenen cihaz bilgileri (analiz için; oyuncuya bir şey sorulmaz)

const DEVICE_KEY = 'deviceId';

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

/** Rastgele kimlik. crypto.randomUUID sadece https'te ve yeni tarayıcılarda var; yoksa yedek üretilir. */
export function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* yedeğe düş */ }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Bu tarayıcıya özgü kalıcı rastgele kimlik */
export function getDeviceId(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function getTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** create_game için cihaz bilgileri */
export function gameMeta(setupStartedAt: string | null) {
  return {
    setup_started_at: setupStartedAt,
    client_created_at: new Date().toISOString(),
    timezone: getTimezone(),
    device_id: getDeviceId(),
    app_version: APP_VERSION,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
    language: typeof navigator !== 'undefined' ? navigator.language : null,
    screen: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : null,
    standalone: typeof window !== 'undefined' ? window.matchMedia('(display-mode: standalone)').matches : null,
  };
}

/** save_round için cihaz bilgileri */
export function roundMeta(entryStartedAt: string | null) {
  return {
    client_started_at: entryStartedAt,
    device_id: getDeviceId(),
    app_version: APP_VERSION,
  };
}
