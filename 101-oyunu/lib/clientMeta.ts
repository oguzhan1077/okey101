// Kayıtlara otomatik eklenen cihaz bilgileri (analiz için; oyuncuya bir şey sorulmaz)

const DEVICE_KEY = 'deviceId';

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

/** Bu tarayıcıya özgü kalıcı rastgele kimlik */
export function getDeviceId(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
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
