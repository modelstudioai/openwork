import React from 'react';
import ReactDOM from 'react-dom/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DaemonWorkspaceProvider,
  type DaemonStreamingState,
} from '@qwen-code/webui/daemon-react-sdk';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RootErrorFallback } from './components/RootErrorFallback';
import { WorkspaceSessionProvider } from './components/WorkspaceSessionProvider';
import {
  getDaemonBaseUrl,
  getDaemonToken,
  removeDaemonTokenFromUrl,
  waitForDaemonTokenMessage,
} from './config/daemon';
import { normalizeLanguage, type WebShellLanguage } from './i18n';
import { WebShellThemeId, type WebShellTheme } from './themeContext';
import { buildSessionPathname, parseSessionId } from './utils/sessionPath';
import type { WebShellApi } from './App';
import type { WebShellComposerApi } from './customization';
import {
  notifyOpenWorkTurnComplete,
  OpenWorkDesktopLayer,
  OpenWorkWelcomeFooter,
  openInOpenWorkBrowser,
  recordOpenWorkSession,
} from './openwork/OpenWorkDesktopLayer';
import 'katex/dist/katex.min.css';
import './styles/standalone.css';

const DAEMON_BASE_URL = getDaemonBaseUrl();

const LANGUAGE_STORAGE_KEY = 'qwen-code-web-shell-language';
const THEME_STORAGE_KEY = 'qwen-code-web-shell-theme';
const OPENWORK_CLIENT_STATE_EVENT = 'openwork:client-state-changed';
const OPENWORK_HYDRATE_SHELL_EVENT = 'openwork:hydrate-shell-preferences';

function parseTheme(value: string | null): WebShellTheme | undefined {
  if (value === WebShellThemeId.Dark || value === WebShellThemeId.Light) {
    return value;
  }
  return undefined;
}

function getThemeFromUrl(): WebShellTheme | undefined {
  const theme = new URLSearchParams(window.location.search).get('theme');
  return parseTheme(theme);
}

function readStoredTheme(): WebShellTheme | undefined {
  try {
    return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

function storeTheme(theme: WebShellTheme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures in private browsing or locked-down browsers.
  }
  window.dispatchEvent(new Event(OPENWORK_CLIENT_STATE_EVENT));
}

function getInitialTheme(): WebShellTheme {
  return getThemeFromUrl() ?? readStoredTheme() ?? WebShellThemeId.Dark;
}

function readStoredLanguage(): WebShellLanguage | undefined {
  try {
    const raw = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return raw ? normalizeLanguage(raw) : undefined;
  } catch {
    return undefined;
  }
}

function storeLanguage(language: WebShellLanguage): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore storage failures in private browsing or locked-down browsers.
  }
  window.dispatchEvent(new Event(OPENWORK_CLIENT_STATE_EVENT));
}

function getInitialLanguage(): WebShellLanguage {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('language') ?? params.get('lang');
  if (raw) return normalizeLanguage(raw);
  return normalizeLanguage(readStoredLanguage() ?? navigator.language);
}

function getSessionIdFromUrl(): string | undefined {
  return parseSessionId(window.location.pathname);
}

function getWorkspaceIdFromUrl(): string | undefined {
  return (
    new URLSearchParams(window.location.search).get('workspace') || undefined
  );
}

function replaceStandaloneSessionUrl(
  sessionId: string | undefined,
  workspaceId?: string,
): void {
  const url = new URL(window.location.href);
  url.pathname = buildSessionPathname(url.pathname, sessionId);
  if (sessionId && workspaceId) {
    url.searchParams.set('workspace', workspaceId);
  } else {
    url.searchParams.delete('workspace');
  }
  // Strip one-shot query params so bookmarked / shared URLs do not
  // permanently override stored preferences on every page load.
  url.searchParams.delete('theme');
  url.searchParams.delete('language');
  url.searchParams.delete('lang');
  if (!import.meta.env.DEV) {
    url.searchParams.delete('token');
    url.searchParams.delete('daemon');
  }
  window.history.replaceState(null, '', url);
}

function StandaloneApp({ daemonToken }: { daemonToken?: string }) {
  const shellRef = useRef<WebShellApi | null>(null);
  const composerRef = useRef<WebShellComposerApi | null>(null);
  const [theme, setTheme] = useState<WebShellTheme>(() => getInitialTheme());
  const [language, setLanguage] = useState<WebShellLanguage>(() =>
    getInitialLanguage(),
  );
  const [sessionId] = useState<string | undefined>(() => getSessionIdFromUrl());
  const [workspaceId] = useState<string | undefined>(() =>
    getWorkspaceIdFromUrl(),
  );
  const [streamingState, setStreamingState] =
    useState<DaemonStreamingState>('idle');
  const baseUrl = DAEMON_BASE_URL || window.location.origin;
  useEffect(() => {
    const handleHydration = (event: Event) => {
      const detail = (
        event as CustomEvent<{ theme?: unknown; language?: unknown }>
      ).detail;
      const nextTheme = parseTheme(
        typeof detail?.theme === 'string' ? detail.theme : null,
      );
      if (nextTheme) setTheme(nextTheme);
      if (typeof detail?.language === 'string')
        setLanguage(normalizeLanguage(detail.language));
    };
    window.addEventListener(OPENWORK_HYDRATE_SHELL_EVENT, handleHydration);
    return () =>
      window.removeEventListener(OPENWORK_HYDRATE_SHELL_EVENT, handleHydration);
  }, []);
  // Keep the <html> theme class and <meta name="theme-color"> in sync with
  // the React theme so mobile status bars / overscroll backgrounds stay
  // consistent when the user toggles or when ?theme= lands via URL.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light', 'dark');
    root.classList.add(`theme-${theme}`);
    root.classList.toggle('dark', theme === WebShellThemeId.Dark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#0d0d0d');
    }
  }, [theme]);
  const handleThemeChange = useCallback((nextTheme: WebShellTheme) => {
    setTheme(nextTheme);
    storeTheme(nextTheme);
  }, []);
  const handleLanguageChange = useCallback((nextLanguage: WebShellLanguage) => {
    setLanguage(nextLanguage);
    storeLanguage(nextLanguage);
  }, []);
  const handleSessionIdChange = useCallback(
    (nextSessionId?: string, nextWorkspaceId?: string) => {
      replaceStandaloneSessionUrl(nextSessionId, nextWorkspaceId);
      if (nextSessionId) recordOpenWorkSession(nextSessionId, nextWorkspaceId);
    },
    [],
  );

  return (
    <ErrorBoundary
      label="web-shell-root"
      fallback={(error, reset) => (
        <RootErrorFallback error={error} onRetry={reset} language={language} />
      )}
    >
      <DaemonWorkspaceProvider baseUrl={baseUrl} token={daemonToken}>
        <WorkspaceSessionProvider
          sessionId={sessionId}
          workspaceId={workspaceId}
          webShellProps={{
            theme,
            onThemeChange: handleThemeChange,
            language,
            onLanguageChange: handleLanguageChange,
            onSessionIdChange: handleSessionIdChange,
            shellRef,
            composerRef,
            onSessionChange: (event) => {
              if (event.type === 'turn_complete') {
                if (document.hidden) notifyOpenWorkTurnComplete();
              }
            },
            onStreamingStateChange: setStreamingState,
            sidebar: true,
            header: {
              items: ['title', 'environment', 'rightPanel'],
            },
            rightPanel: {
              items: ['review', 'sideTask'],
            },
            environmentPanel: {
              items: ['environment', 'subagents', 'backgroundTasks'],
            },
            compactThinking: true,
            markdownTableMode: 'advanced',
            markdown: {
              onOpenLink: openInOpenWorkBrowser,
            },
            renderWelcomeFooter: () => (
              <OpenWorkWelcomeFooter composerRef={composerRef} />
            ),
          }}
        />
        <OpenWorkDesktopLayer
          shellRef={shellRef}
          turnActive={streamingState !== 'idle'}
        />
      </DaemonWorkspaceProvider>
    </ErrorBoundary>
  );
}

async function main() {
  const daemonToken = getDaemonToken() ?? (await waitForDaemonTokenMessage());
  removeDaemonTokenFromUrl();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <StandaloneApp daemonToken={daemonToken} />
    </React.StrictMode>,
  );
}

void main();
