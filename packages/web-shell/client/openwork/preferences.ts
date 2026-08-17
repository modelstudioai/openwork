import {
  applyOpenWorkTheme,
  isOpenWorkThemeId,
  type OpenWorkThemeId,
} from './themes';

export type OpenWorkTextScale = 0.9 | 1 | 1.15;
export const OPENWORK_ZOOM_LEVELS = [
  50, 67, 80, 90, 100, 110, 125, 150, 175, 200,
] as const;

export interface OpenWorkPreferences {
  presetTheme: OpenWorkThemeId;
  zoom: number;
  textScale: OpenWorkTextScale;
  highContrast: boolean;
  reduceMotion: boolean;
  keepAwake: boolean;
}

const STORAGE_KEY = 'openwork-desktop-preferences';
const EVENT_NAME = 'openwork:preferences';
const CLIENT_STATE_EVENT = 'openwork:client-state-changed';

export const DEFAULT_OPENWORK_PREFERENCES: OpenWorkPreferences = {
  presetTheme: 'default',
  zoom: 100,
  textScale: 1,
  highContrast: false,
  reduceMotion: false,
  keepAwake: true,
};

export function sanitizeOpenWorkPreferences(
  value: unknown,
): OpenWorkPreferences {
  const input = value && typeof value === 'object' ? value : {};
  const data = input as Partial<OpenWorkPreferences>;
  const zoom = Number(data.zoom);
  return {
    presetTheme: isOpenWorkThemeId(data.presetTheme)
      ? data.presetTheme
      : 'default',
    zoom:
      Number.isFinite(zoom) &&
      OPENWORK_ZOOM_LEVELS.includes(
        zoom as (typeof OPENWORK_ZOOM_LEVELS)[number],
      )
        ? zoom
        : 100,
    textScale:
      data.textScale === 0.9 || data.textScale === 1 || data.textScale === 1.15
        ? data.textScale
        : 1,
    highContrast: data.highContrast === true,
    reduceMotion: data.reduceMotion === true,
    keepAwake: typeof data.keepAwake === 'boolean' ? data.keepAwake : true,
  };
}

export function notifyOpenWorkClientStateChanged(): void {
  window.dispatchEvent(new Event(CLIENT_STATE_EVENT));
}

export function readOpenWorkPreferences(): OpenWorkPreferences {
  try {
    return sanitizeOpenWorkPreferences(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'),
    );
  } catch {
    return DEFAULT_OPENWORK_PREFERENCES;
  }
}

export function writeOpenWorkPreferences(
  preferences: OpenWorkPreferences,
): void {
  const next = sanitizeOpenWorkPreferences(preferences);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The live preference still applies when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  notifyOpenWorkClientStateChanged();
}

export function subscribeOpenWorkPreferences(
  listener: (preferences: OpenWorkPreferences) => void,
): () => void {
  const handle = (event: Event) => {
    listener((event as CustomEvent<OpenWorkPreferences>).detail);
  };
  window.addEventListener(EVENT_NAME, handle);
  return () => window.removeEventListener(EVENT_NAME, handle);
}

export function applyOpenWorkPreferences(
  preferences: OpenWorkPreferences,
): void {
  const root = document.documentElement;
  root.style.setProperty(
    '--openwork-chat-text-scale',
    String(preferences.textScale),
  );
  root.toggleAttribute('data-openwork-high-contrast', preferences.highContrast);
  root.toggleAttribute('data-openwork-reduce-motion', preferences.reduceMotion);
  applyOpenWorkTheme(preferences.presetTheme);
}
