# E2E harness (CDP)

A dependency-free end-to-end harness that launches the **built** OpenWork
Electron app with the Chrome DevTools Protocol enabled, drives the real UI over
CDP, and asserts on what the user would actually see.

It exists so an automated feature loop (and humans) can answer one question per
change: **does this feature actually work in the running app?**

## Run it

```bash
bun run e2e
```

This will:

1. Build the Electron bundles if `apps/electron/dist/{main.cjs,renderer/index.html}`
   are missing (set `E2E_BUILD=1` to force a rebuild).
2. For **each** `e2e/assertions/*.assert.ts`, launch a fresh, isolated app
   instance with `--remote-debugging-port`, run the assertion, then shut it down.
3. Print a pass/fail summary and exit non-zero if anything failed (so it can gate
   a PR).

Failure screenshots land in `.e2e/screenshots/` (gitignored). The app runs
against an isolated profile under `.e2e/` so runs never touch your real OpenWork
data — Electron userData, app config (`~/.craft-agent`), and the default
conversation workspace (`~/Documents/...`) are all redirected under `.e2e/`.

### Headless / CI / cloud

On a headless Linux host (no `DISPLAY`), the launcher automatically runs Electron
under `xvfb-run` with `--no-sandbox`. The host must have `xvfb` and Electron's
runtime libraries (`libgtk-3`, `libnss3`, …) installed.

### Environment knobs

| Var | Effect |
| --- | --- |
| `E2E_BUILD=1` | Force `electron:build` before launching. |
| `E2E_PORT=<n>` | Pin the remote-debugging port instead of using a free one. |

## Add an assertion

Drop a `*.assert.ts` file into `e2e/assertions/`. It must default-export an
`Assertion` — `{ name, run(app) }`. The runner discovers it automatically.

```ts
import type { Assertion } from '../runner';

const assertion: Assertion = {
  name: 'settings dialog opens from the sidebar',
  async run(app) {
    const { session } = app;
    await session.click('[aria-label="Settings"]');
    await session.waitForSelector('[role="dialog"]');
    const heading = await session.getText('[role="dialog"] h2');
    if (heading?.trim() !== 'Settings') {
      throw new Error(`expected Settings dialog, saw heading: ${heading}`);
    }
  },
};

export default assertion;
```

Guidelines:

- **Assert on visible result/state, not "it booted."** A green check should mean
  the feature's key path works.
- Prefer stable selectors (`role`, `aria-label`, visible text) over brittle
  class chains. If the UI lacks a hook, add a `data-testid` in the same PR.
- Each assertion gets a clean app instance, so they're independent and order
  doesn't matter.

## How it works

- `cdp.ts` — minimal CDP client over Bun's global `WebSocket` + `fetch`
  (`evaluate`, `waitForFunction`, `waitForSelector`, `click`, `getText`,
  `screenshot`). Zero external deps.
- `app.ts` — launches `electron apps/electron --remote-debugging-port=<port>`,
  finds the main renderer target (title `Qwen Code Desktop`), attaches a session,
  and owns teardown.
- `runner.ts` — discovers assertions, runs each against a fresh app, reports.
- `assertions/*.assert.ts` — the checks themselves.
