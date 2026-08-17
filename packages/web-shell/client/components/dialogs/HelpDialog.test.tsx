// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n';
import { HelpDialog } from './HelpDialog';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('HelpDialog search', () => {
  it('filters keyboard shortcuts from the General tab', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <I18nProvider language="en">
          <HelpDialog commands={[]} />
        </I18nProvider>,
      );
    });
    const search = container.querySelector<HTMLInputElement>(
      'input[placeholder="Search commands"]',
    );
    if (!search) throw new Error('Shortcuts search not found');

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(search, 'command palette');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.textContent).toContain('Open the command palette');
    expect(container.textContent).toContain('Cmd/Ctrl+K');
    expect(container.textContent).not.toContain('Run shell commands');
    act(() => root.unmount());
    container.remove();
  });
});
