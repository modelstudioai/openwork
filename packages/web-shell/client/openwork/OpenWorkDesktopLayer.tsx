import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import type { WebShellApi } from '../App';
import type {
  WebShellComposerApi,
  WebShellComposerToolbarRenderInfo,
} from '../customization';
import {
  WEB_SHELL_LANGUAGES,
  normalizeLanguage,
  useI18n,
  type WebShellLanguage,
} from '../i18n';
import {
  readRecentCommands,
  recordRecentCommand,
  replaceRecentCommands,
} from './command-recents';
import {
  applyOpenWorkPreferences,
  notifyOpenWorkClientStateChanged,
  OPENWORK_ZOOM_LEVELS,
  readOpenWorkPreferences,
  subscribeOpenWorkPreferences,
  writeOpenWorkPreferences,
  type OpenWorkPreferences,
  type OpenWorkTextScale,
} from './preferences';
import { OPENWORK_THEME_IDS, OPENWORK_THEMES } from './themes';
import styles from './OpenWorkDesktopLayer.module.css';

interface TauriEvent<T> {
  payload: T;
}

interface TauriGlobal {
  core?: {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  };
  event?: {
    listen<T>(
      event: string,
      handler: (event: TauriEvent<T>) => void,
    ): Promise<() => void>;
  };
}

interface RecentSession {
  id: string;
  workspaceId?: string;
  visitedAt: number;
}

interface BrowserState {
  url: string;
  open: boolean;
}

interface PetInfo {
  id: string;
  displayName: string;
  description: string;
}

interface OpenWorkClientState {
  preferences: OpenWorkPreferences;
  chatWidth: '840' | '1100' | 'wide';
  theme?: 'dark' | 'light';
  language?: WebShellLanguage;
  recentCommands: string[];
  recentSessions: RecentSession[];
  petEnabled: boolean;
  petId: string;
}

const RECENTS_KEY = 'openwork-recent-sessions';
const PET_KEY = 'openwork-desktop-pet-enabled';
const PET_ID_KEY = 'openwork-desktop-pet-id';
const CHAT_WIDTH_KEY = 'qwen-code-web-shell-chat-width';
const THEME_KEY = 'qwen-code-web-shell-theme';
const LANGUAGE_KEY = 'qwen-code-web-shell-language';
const CLIENT_STATE_EVENT = 'openwork:client-state-changed';
const HYDRATE_SHELL_EVENT = 'openwork:hydrate-shell-preferences';

function tauri(): TauriGlobal | undefined {
  return (window as Window & { __TAURI__?: TauriGlobal }).__TAURI__;
}

export async function invokeOpenWork<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T | undefined> {
  return tauri()?.core?.invoke<T>(command, args);
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readRecents(): RecentSession[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
    return Array.isArray(value)
      ? value
          .filter(
            (item): item is RecentSession =>
              typeof item?.id === 'string' &&
              /^[A-Za-z0-9._-]{1,128}$/.test(item.id) &&
              typeof item?.visitedAt === 'number' &&
              (item.workspaceId === undefined ||
                typeof item.workspaceId === 'string'),
          )
          .slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

function writeRecents(recents: readonly RecentSession[]): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, 6)));
  } catch {
    // Recents are convenience-only.
  }
  notifyOpenWorkClientStateChanged();
}

function setPetEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PET_KEY, String(enabled));
  } catch {
    // The pet can still be toggled for the current run.
  }
  notifyOpenWorkClientStateChanged();
}

function setPetId(id: string): void {
  if (!/^[a-z0-9-]{1,64}$/.test(id)) return;
  try {
    localStorage.setItem(PET_ID_KEY, id);
  } catch {
    // The selected pet can still be previewed for the current run.
  }
  notifyOpenWorkClientStateChanged();
}

export function recordOpenWorkSession(id: string, workspaceId?: string): void {
  writeRecents([
    { id, workspaceId, visitedAt: Date.now() },
    ...readRecents().filter((item) => item.id !== id),
  ]);
}

function usePreferences(): [
  OpenWorkPreferences,
  (patch: Partial<OpenWorkPreferences>) => void,
] {
  const [preferences, setPreferences] = useState(readOpenWorkPreferences);
  useEffect(() => subscribeOpenWorkPreferences(setPreferences), []);
  const update = useCallback(
    (patch: Partial<OpenWorkPreferences>) => {
      writeOpenWorkPreferences({ ...preferences, ...patch });
    },
    [preferences],
  );
  return [preferences, update];
}

function resizeBrowserDock(): void {
  const x = Math.round(window.innerWidth * 0.45);
  void invokeOpenWork('browser_set_bounds', {
    x,
    y: 48,
    width: window.innerWidth - x,
    height: window.innerHeight - 48,
  }).catch(() => undefined);
}

function openSession(id: string, workspaceId?: string): void {
  window.dispatchEvent(
    new CustomEvent('qwen:open-session', {
      detail: workspaceId ? { sessionId: id, workspaceId } : id,
    }),
  );
}

function parseDeepLink(value: string): void {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'openwork:' ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      return;
    if (url.hostname === 'session') {
      const sessionId = url.pathname.replace(/^\//, '');
      if (/^[A-Za-z0-9._-]{1,128}$/.test(sessionId)) openSession(sessionId);
    } else if (url.hostname === 'new' && /^\/?$/.test(url.pathname)) {
      window.dispatchEvent(new Event('openwork:new-session'));
    }
  } catch {
    // Ignore invalid external input at the URL boundary.
  }
}

export async function drainOpenWorkDeepLinks(
  take: () => Promise<string[] | undefined>,
  open: (value: string) => void,
): Promise<void> {
  (await take())?.forEach(open);
}

export function openInOpenWorkBrowser(url: string): boolean {
  let safe = false;
  try {
    const parsed = new URL(url);
    safe =
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password;
  } catch {
    // Fall through to the host's normal link handling.
  }
  if (!safe || !tauri()?.core?.invoke) return false;
  window.dispatchEvent(
    new CustomEvent('openwork:open-browser', { detail: url }),
  );
  return true;
}

export function notifyOpenWorkTurnComplete(): void {
  void invokeOpenWork('notify_turn_complete', {
    title: 'OpenWork',
    body: 'Task completed',
  }).catch(() => undefined);
}

export function OpenWorkWelcomeFooter({
  composerRef,
}: {
  composerRef: MutableRefObject<WebShellComposerApi | null>;
}) {
  const { t } = useI18n();
  const starters = [
    t('openwork.starters.review'),
    t('openwork.starters.explain'),
    t('openwork.starters.fix'),
  ];
  return (
    <div className={styles.starters} aria-label={t('openwork.starters.label')}>
      {starters.map((starter) => (
        <button
          key={starter}
          type="button"
          onClick={() => composerRef.current?.setText(starter)}
        >
          {starter}
        </button>
      ))}
    </div>
  );
}

export function OpenWorkComposerTools({
  text,
  runCommand,
  disabled,
}: WebShellComposerToolbarRenderInfo) {
  const { t } = useI18n();
  const [effort, setEffort] = useState('default');
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/u).length : 0;
  const characters = [...text].length;
  const toggleExpanded = (button: HTMLButtonElement) => {
    const composer = button.closest('[data-web-shell-composer]');
    if (!composer) return;
    composer.toggleAttribute(
      'data-openwork-expanded',
      !composer.hasAttribute('data-openwork-expanded'),
    );
  };
  return (
    <div className={styles.composerTools}>
      {trimmed && (
        <span
          className={styles.characterCount}
          aria-label={t('openwork.composer.countLabel', {
            words,
            characters,
          })}
          aria-live="polite"
        >
          {t('openwork.composer.count', { words, characters })}
        </span>
      )}
      <select
        aria-label={t('openwork.composer.effort')}
        value={effort}
        disabled={disabled}
        onChange={(event) => {
          const value = event.target.value;
          setEffort(value);
          runCommand(`/effort ${value}`);
        }}
      >
        <option value="default">{t('openwork.effort.default')}</option>
        <option value="low">{t('openwork.effort.low')}</option>
        <option value="medium">{t('openwork.effort.medium')}</option>
        <option value="high">{t('openwork.effort.high')}</option>
        <option value="xhigh">{t('openwork.effort.xhigh')}</option>
        <option value="max">{t('openwork.effort.max')}</option>
      </select>
      <button
        type="button"
        aria-label={t('openwork.composer.expand')}
        title={t('openwork.composer.expand')}
        onClick={(event) => toggleExpanded(event.currentTarget)}
      >
        ↗
      </button>
    </div>
  );
}

function PreferenceRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className={styles.preferenceRow}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function OpenWorkAppearanceSettings() {
  const { t } = useI18n();
  const [preferences, update] = usePreferences();
  const [pets, setPets] = useState<PetInfo[]>([]);
  const [petId, setSelectedPetId] = useState(
    () => readStorage(PET_ID_KEY) ?? 'qwen',
  );
  useEffect(() => {
    void invokeOpenWork<PetInfo[]>('list_pets')
      .then((items) => setPets(items ?? []))
      .catch(() => undefined);
  }, []);
  return (
    <div className={styles.appearanceSettings}>
      <PreferenceRow label={t('openwork.appearance.theme')}>
        <select
          value={preferences.presetTheme}
          onChange={(event) =>
            update({
              presetTheme: event.target
                .value as OpenWorkPreferences['presetTheme'],
            })
          }
        >
          {OPENWORK_THEME_IDS.map((id) => (
            <option key={id} value={id}>
              {OPENWORK_THEMES[id].name}
            </option>
          ))}
        </select>
      </PreferenceRow>
      <PreferenceRow label={t('openwork.appearance.zoom')}>
        <select
          value={preferences.zoom}
          onChange={(event) => update({ zoom: Number(event.target.value) })}
        >
          {OPENWORK_ZOOM_LEVELS.map((zoom) => (
            <option key={zoom} value={zoom}>
              {zoom}%
            </option>
          ))}
        </select>
      </PreferenceRow>
      <PreferenceRow label={t('openwork.appearance.textSize')}>
        <select
          value={preferences.textScale}
          onChange={(event) =>
            update({
              textScale: Number(event.target.value) as OpenWorkTextScale,
            })
          }
        >
          <option value={0.9}>{t('openwork.appearance.compact')}</option>
          <option value={1}>{t('openwork.appearance.default')}</option>
          <option value={1.15}>{t('openwork.appearance.large')}</option>
        </select>
      </PreferenceRow>
      <PreferenceRow label={t('openwork.appearance.contrast')}>
        <input
          type="checkbox"
          checked={preferences.highContrast}
          onChange={(event) => update({ highContrast: event.target.checked })}
        />
      </PreferenceRow>
      <PreferenceRow label={t('openwork.appearance.reduceMotion')}>
        <input
          type="checkbox"
          checked={preferences.reduceMotion}
          onChange={(event) => update({ reduceMotion: event.target.checked })}
        />
      </PreferenceRow>
      <PreferenceRow label={t('openwork.appearance.keepAwake')}>
        <input
          type="checkbox"
          checked={preferences.keepAwake}
          onChange={(event) => update({ keepAwake: event.target.checked })}
        />
      </PreferenceRow>
      <PreferenceRow label={t('openwork.appearance.pet')}>
        <select
          value={petId}
          onChange={(event) => {
            const nextPetId = event.target.value;
            setSelectedPetId(nextPetId);
            setPetId(nextPetId);
            setPetEnabled(true);
            void invokeOpenWork('toggle_pet', {
              visible: true,
              petId: nextPetId,
            }).catch(() => undefined);
          }}
        >
          <option value="qwen">Qwen</option>
          {pets.map((pet) => (
            <option key={pet.id} value={pet.id} title={pet.description}>
              {pet.displayName}
            </option>
          ))}
        </select>
      </PreferenceRow>
    </div>
  );
}

export function OpenWorkDesktopLayer({
  shellRef,
  turnActive,
}: {
  shellRef: MutableRefObject<WebShellApi | null>;
  turnActive: boolean;
}) {
  const { t } = useI18n();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [clientStateReady, setClientStateReady] = useState(false);
  const [clientStateRevision, setClientStateRevision] = useState(0);
  const [browser, setBrowser] = useState<BrowserState>({
    url: 'https://qwenlm.github.io/qwen-code-docs/',
    open: false,
  });
  const [preferences, updatePreferences] = usePreferences();
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const openBrowser = useCallback((url: string) => {
    setBrowser({ url, open: true });
    void invokeOpenWork('browser_open', { url })
      .then(resizeBrowserDock)
      .catch((error) => {
        setBrowser((current) => ({ ...current, open: false }));
        setMessage(String(error));
      });
  }, []);

  const navigateBrowser = useCallback(
    (action: 'back' | 'forward' | 'reload') => {
      void invokeOpenWork('browser_navigate', { action }).catch((error) =>
        setMessage(String(error)),
      );
    },
    [],
  );

  const checkForUpdates = useCallback(async () => {
    setPaletteOpen(true);
    setMessage(t('openwork.update.checking'));
    try {
      const version = await invokeOpenWork<string | null>('check_for_updates');
      const message =
        version === undefined
          ? t('openwork.update.unavailable')
          : version
            ? t('openwork.update.available', { version })
            : t('openwork.update.upToDate');
      setMessage(message);
      if (
        version &&
        window.confirm(t('openwork.update.installPrompt', { status: message }))
      ) {
        setMessage(t('openwork.update.installing'));
        await invokeOpenWork('install_update');
      }
    } catch (error) {
      setMessage(String(error));
    }
  }, [t]);

  const createPermanentWorktree = useCallback(async () => {
    const name = window.prompt(t('openwork.worktree.prompt'))?.trim();
    if (!name) return;
    setPaletteOpen(true);
    setMessage(t('openwork.worktree.creating'));
    try {
      const created = await shellRef.current?.createWorktreeSession(name);
      setMessage(
        created
          ? t('openwork.worktree.created', { branch: `worktree-${name}` })
          : t('openwork.worktree.unavailable'),
      );
    } catch (error) {
      setMessage(String(error));
    }
  }, [shellRef, t]);

  const togglePet = useCallback(async () => {
    try {
      const open = await invokeOpenWork<boolean>('toggle_pet');
      if (typeof open === 'boolean') {
        setPetEnabled(open);
      }
    } catch (error) {
      setMessage(String(error));
    }
  }, []);

  const adjustZoom = useCallback(
    (direction: -1 | 0 | 1) => {
      const current = OPENWORK_ZOOM_LEVELS.indexOf(
        preferences.zoom as (typeof OPENWORK_ZOOM_LEVELS)[number],
      );
      const zoom =
        direction === 0
          ? 100
          : (OPENWORK_ZOOM_LEVELS[
              Math.min(
                OPENWORK_ZOOM_LEVELS.length - 1,
                Math.max(0, current + direction),
              )
            ] ?? 100);
      updatePreferences({ zoom });
    },
    [preferences.zoom, updatePreferences],
  );

  useEffect(() => {
    applyOpenWorkPreferences(preferences);
    void invokeOpenWork('set_interface_zoom', {
      percent: preferences.zoom,
    }).catch(() => undefined);
  }, [preferences]);

  useEffect(() => {
    const onChange = () => {
      setClientStateRevision((revision) => revision + 1);
      applyOpenWorkPreferences(readOpenWorkPreferences());
    };
    window.addEventListener(CLIENT_STATE_EVENT, onChange);
    return () => window.removeEventListener(CLIENT_STATE_EVENT, onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void invokeOpenWork<OpenWorkClientState>('read_openwork_client_state')
      .then((state) => {
        if (cancelled) return;
        if (state) {
          writeOpenWorkPreferences(state.preferences);
          replaceRecentCommands([
            ...readRecentCommands(),
            ...state.recentCommands,
          ]);
          const localRecents = readRecents();
          writeRecents([
            ...localRecents,
            ...state.recentSessions.filter(
              (session) =>
                !localRecents.some((local) => local.id === session.id),
            ),
          ]);
          setPetEnabled(state.petEnabled);
          setPetId(state.petId);
          try {
            localStorage.setItem(CHAT_WIDTH_KEY, state.chatWidth);
            if (state.theme) localStorage.setItem(THEME_KEY, state.theme);
            if (state.language)
              localStorage.setItem(
                LANGUAGE_KEY,
                normalizeLanguage(state.language),
              );
          } catch {
            // The live values still apply when storage is unavailable.
          }
          notifyOpenWorkClientStateChanged();
          window.dispatchEvent(
            new CustomEvent(HYDRATE_SHELL_EVENT, {
              detail: {
                chatWidth: state.chatWidth,
                theme: state.theme,
                language: state.language,
              },
            }),
          );
        }
        setClientStateReady(true);
      })
      .catch(() => setClientStateReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!clientStateReady) return;
    const chatWidth = readStorage(CHAT_WIDTH_KEY);
    const theme = readStorage(THEME_KEY);
    const language = readStorage(LANGUAGE_KEY);
    void invokeOpenWork('write_openwork_client_state', {
      clientState: {
        preferences: readOpenWorkPreferences(),
        chatWidth:
          chatWidth === '840' || chatWidth === 'wide' ? chatWidth : '1100',
        theme: theme === 'dark' || theme === 'light' ? theme : undefined,
        language: WEB_SHELL_LANGUAGES.find(
          (candidate) => candidate === language,
        ),
        recentCommands: readRecentCommands(),
        recentSessions: readRecents(),
        petEnabled: readStorage(PET_KEY) === 'true',
        petId:
          readStorage(PET_ID_KEY)?.match(/^[a-z0-9-]{1,64}$/)?.[0] ?? 'qwen',
      } satisfies OpenWorkClientState,
    }).catch(() => undefined);
  }, [clientStateReady, clientStateRevision]);

  useEffect(() => {
    if (clientStateReady && readStorage(PET_KEY) === 'true') {
      void invokeOpenWork('toggle_pet', { visible: true }).catch(
        () => undefined,
      );
    }
  }, [clientStateReady]);

  useEffect(() => {
    if (!preferences.keepAwake || !turnActive || !('wakeLock' in navigator)) {
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
      return;
    }
    let active = true;
    const request = () => {
      if (
        document.hidden ||
        (wakeLockRef.current && !wakeLockRef.current.released)
      )
        return;
      void navigator.wakeLock
        .request('screen')
        .then((lock) => {
          if (active) wakeLockRef.current = lock;
          else void lock.release();
        })
        .catch(() => undefined);
    };
    const handleVisibility = () => {
      if (document.hidden) {
        void wakeLockRef.current?.release();
        wakeLockRef.current = null;
      } else {
        request();
      }
    };
    request();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [preferences.keepAwake, turnActive]);

  useEffect(() => {
    const onOpenBrowser = (event: Event) => {
      const url = (event as CustomEvent<string>).detail;
      if (/^https?:\/\//i.test(url)) openBrowser(url);
    };
    const onNewSession = () => void shellRef.current?.createNewSession();
    const onResize = () => browser.open && resizeBrowserDock();
    window.addEventListener('openwork:open-browser', onOpenBrowser);
    window.addEventListener('openwork:new-session', onNewSession);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('openwork:open-browser', onOpenBrowser);
      window.removeEventListener('openwork:new-session', onNewSession);
      window.removeEventListener('resize', onResize);
    };
  }, [browser.open, openBrowser, shellRef]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (command && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        document
          .querySelector('[data-web-shell-composer]')
          ?.toggleAttribute('data-openwork-expanded');
      }
      if (command && ['+', '=', '-', '0'].includes(event.key)) {
        event.preventDefault();
        adjustZoom(event.key === '0' ? 0 : event.key === '-' ? -1 : 1);
      }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adjustZoom]);

  useEffect(() => {
    const listen = tauri()?.event?.listen;
    if (!listen) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const drainPendingDeepLinks = async () => {
      await drainOpenWorkDeepLinks(
        () => invokeOpenWork<string[]>('take_pending_deep_links'),
        (value) => {
          if (!disposed) parseDeepLink(value);
        },
      );
    };
    void (async () => {
      const unlisten = await listen<string>('openwork-deep-link', () => {
        void drainPendingDeepLinks().catch(() => undefined);
      });
      if (disposed) return unlisten();
      unlisteners.push(unlisten);
      await drainPendingDeepLinks();
    })().catch(() => undefined);
    void listen<string>('openwork-menu', (event) => {
      const action = event.payload;
      if (action === 'new') void shellRef.current?.createNewSession();
      if (action === 'settings') shellRef.current?.openSettings();
      if (action === 'worktree') void createPermanentWorktree();
      if (action === 'shortcuts') shellRef.current?.openShortcuts();
      if (action === 'browser') openBrowser(browser.url);
      if (action === 'pet') void togglePet();
      if (action === 'update') void checkForUpdates();
      if (action === 'zoom-in') adjustZoom(1);
      if (action === 'zoom-out') adjustZoom(-1);
      if (action === 'zoom-reset') adjustZoom(0);
    })
      .then((unlisten) => {
        if (disposed) return unlisten();
        unlisteners.push(unlisten);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [
    adjustZoom,
    browser.url,
    checkForUpdates,
    createPermanentWorktree,
    openBrowser,
    shellRef,
    togglePet,
  ]);

  interface PaletteAction {
    id: string;
    label: string;
    keepOpen?: boolean;
    run(): void;
  }
  const actions = useMemo<PaletteAction[]>(
    () => [
      {
        id: 'new',
        label: t('openwork.action.new'),
        run: () => void shellRef.current?.createNewSession(),
      },
      {
        id: 'settings',
        label: t('openwork.action.settings'),
        run: () => shellRef.current?.openSettings(),
      },
      {
        id: 'shortcuts',
        label: t('openwork.action.shortcuts'),
        run: () => shellRef.current?.openShortcuts(),
      },
      {
        id: 'skills',
        label: t('openwork.action.skills'),
        run: () => shellRef.current?.openSkills(),
      },
      {
        id: 'channels',
        label: t('openwork.action.channels'),
        run: () => shellRef.current?.openChannels(),
      },
      {
        id: 'worktree',
        label: t('openwork.action.worktree'),
        keepOpen: true,
        run: () => void createPermanentWorktree(),
      },
      {
        id: 'browser',
        label: t('openwork.action.browser'),
        run: () => openBrowser(browser.url),
      },
      {
        id: 'pet',
        label: t('openwork.action.pet'),
        run: () => void togglePet(),
      },
      {
        id: 'update',
        label: t('openwork.action.update'),
        keepOpen: true,
        run: () => void checkForUpdates(),
      },
      {
        id: 'proxy',
        label: t('openwork.action.proxy'),
        keepOpen: true,
        run: () =>
          void invokeOpenWork<string>('proxy_status')
            .then((value) => setMessage(value ?? t('openwork.proxy.direct')))
            .catch((error) => setMessage(String(error))),
      },
    ],
    [
      browser.url,
      checkForUpdates,
      createPermanentWorktree,
      openBrowser,
      shellRef,
      t,
      togglePet,
    ],
  );
  const normalized = query.trim().toLowerCase();
  const visibleActions = actions.filter((action) =>
    action.label.toLowerCase().includes(normalized),
  );
  const recentActions = normalized
    ? []
    : readRecentCommands().flatMap((id) => {
        const action = actions.find((candidate) => candidate.id === id);
        return action ? [action] : [];
      });
  const recents = readRecents().filter((item) =>
    item.id.toLowerCase().includes(normalized),
  );

  return (
    <>
      {browser.open && (
        <div className={styles.browserToolbar}>
          <button
            type="button"
            aria-label={t('openwork.browser.back')}
            title={t('openwork.browser.back')}
            onClick={() => navigateBrowser('back')}
          >
            ←
          </button>
          <button
            type="button"
            aria-label={t('openwork.browser.forward')}
            title={t('openwork.browser.forward')}
            onClick={() => navigateBrowser('forward')}
          >
            →
          </button>
          <button
            type="button"
            aria-label={t('openwork.browser.reload')}
            onClick={() => navigateBrowser('reload')}
          >
            ↻
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const url = browser.url.includes('://')
                ? browser.url
                : `https://${browser.url}`;
              openBrowser(url);
            }}
          >
            <input
              aria-label={t('openwork.browser.address')}
              value={browser.url}
              onChange={(event) =>
                setBrowser({ open: true, url: event.target.value })
              }
            />
          </form>
          <button
            type="button"
            aria-label={t('openwork.browser.close')}
            onClick={() => {
              setBrowser((value) => ({ ...value, open: false }));
              void invokeOpenWork('browser_close').catch((error) => {
                setBrowser((value) => ({ ...value, open: true }));
                setMessage(String(error));
              });
            }}
          >
            ×
          </button>
        </div>
      )}
      {paletteOpen && (
        <div
          className={styles.paletteBackdrop}
          role="presentation"
          onMouseDown={() => setPaletteOpen(false)}
        >
          <section
            className={styles.palette}
            role="dialog"
            aria-modal="true"
            aria-label={t('openwork.palette.label')}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <input
              autoFocus
              type="search"
              value={query}
              placeholder={t('openwork.palette.search')}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className={styles.paletteList}>
              {recentActions.map((action) => (
                <button
                  key={`recent:${action.id}`}
                  type="button"
                  onClick={() => {
                    recordRecentCommand(action.id);
                    action.run();
                    if (!action.keepOpen) setPaletteOpen(false);
                  }}
                >
                  {t('openwork.palette.recent')} · {action.label}
                </button>
              ))}
              {visibleActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    recordRecentCommand(action.id);
                    action.run();
                    if (!action.keepOpen) setPaletteOpen(false);
                  }}
                >
                  {action.label}
                </button>
              ))}
              {recents.map((recent) => (
                <button
                  key={recent.id}
                  type="button"
                  onClick={() => {
                    openSession(recent.id, recent.workspaceId);
                    setPaletteOpen(false);
                  }}
                >
                  {t('openwork.palette.recentTask')} · {recent.id}
                </button>
              ))}
            </div>
            {message && (
              <div className={styles.paletteMessage} role="status">
                {message}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
