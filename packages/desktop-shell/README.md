# OpenWork desktop shell

This package is an isolated Tauri 2 shell around the existing Web Shell. It does not contain a second UI.

## Runtime layout

`npm run build:runtime` prepares `runtime/openwork/` with:

- the current platform's Node.js runtime,
- the bundled `qwen` CLI,
- the built Web Shell under `lib/web-shell/`.

The Tauri app starts the bundled `qwen serve` runtime on an ephemeral loopback port with a per-launch bearer token, waits for deep health, and then opens that same daemon-served Web Shell in the native window.

Use **Control → Local Control…** to temporarily share that live daemon with a phone on the same Wi-Fi. The app displays a QR code, keeps the computer awake while sharing is enabled, and closes the LAN gateway when the control window closes or the user turns it off.

## Local development

From this directory:

```bash
npm install --workspaces=false
npm run build:runtime --workspaces=false
npm run dev --workspaces=false
```

The install and runtime build are only needed the first time or after dependencies/runtime sources change. For later runs, `npm run dev --workspaces=false` is enough. Run `npm test --workspaces=false` for the Rust checks.

Use `OPENWORK_DESKTOP_WORKSPACE=/absolute/path` to override the initial workspace. The app otherwise restores its saved primary workspace or creates `~/Documents/OpenWork` on first launch. `OPENWORK_DEFAULT_WORKSPACE_DIR=/absolute/path` relocates that first-launch default, matching the Electron shell. Add and switch project workspaces from the Web Shell after startup.

## Releases

PR1 supports local development and local bundle builds. Updater artifacts, signing, notarization, and release automation are deferred to PR2.
