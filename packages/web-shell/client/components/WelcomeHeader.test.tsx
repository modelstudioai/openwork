// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { I18nProvider, type WebShellLanguage } from '../i18n';
import { WelcomeHeader } from './WelcomeHeader';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

function render(language: WebShellLanguage): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <I18nProvider language={language}>
        <WelcomeHeader
          version="0.1.0"
          cwd="/workspace"
          currentModel="model"
          currentMode="default"
        />
      </I18nProvider>,
    );
  });
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

describe('WelcomeHeader', () => {
  it.each([
    ['en', 'Welcome toOpenWorkWhat would you like to do?'],
    ['zh-CN', '欢迎使用OpenWork你想构建什么？'],
  ] as const)('renders OpenWork branding in %s', (language, expected) => {
    expect(render(language).textContent).toBe(expected);
  });
});
