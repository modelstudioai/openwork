# OpenWork desktop shell

This package is an isolated Tauri 2 shell around the existing Web Shell. It does not contain a second UI.

## Runtime layout

`npm run build:runtime` prepares `runtime/openwork/` with:

- the current platform's Node.js runtime,
- a pinned `uv` runtime and the eight historical document-tool launchers,
- the document Python scripts and first-launch migration entrypoint,
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

Set `OPENWORK_UV_DOWNLOAD_ROOT` to a trusted mirror of the pinned uv release
directory when GitHub release assets are unavailable.

Set `OPENWORK_DESKTOP_NODE_CACHE_DIR` to reuse a verified Node.js archive
between runtime builds. Cached archives are checked against Node.js release
checksums before use.

The install and runtime build are only needed the first time or after dependencies/runtime sources change. For later runs, `npm run dev --workspaces=false` is enough. Run `npm test --workspaces=false` for the Rust checks.

Use `OPENWORK_DESKTOP_WORKSPACE=/absolute/path` to override the initial workspace. The app otherwise restores its saved primary workspace or creates `~/Documents/OpenWork` on first launch. `OPENWORK_DEFAULT_WORKSPACE_DIR=/absolute/path` relocates that first-launch default, matching the Electron shell. Add and switch project workspaces from the Web Shell after startup.

On first launch, the shell non-destructively imports compatible session and preference data from `~/.craft-agent`, records checksums in `~/.qwen/openwork-migration-v1.json`, and leaves credentials untouched. The existing `$QWEN_HOME/oauth_creds.json` remains the shared Qwen login, while legacy encrypted third-party credentials stay in place for rollback. To roll back unchanged migration-created files, run `node runtime/openwork/tools/openwork-migrate.mjs --rollback` from an unpacked app runtime or invoke the same bundled script with `QWEN_HOME` pointed at the target Qwen directory.

Custom desktop pets are discovered from `~/.qwen/pets/<pet-id>/pet.json`; the manifest's sprite path must remain inside that pet directory.

## Releases

Run the **Desktop Release** workflow with a semantic version. Dry runs upload installers as workflow artifacts; published runs must start from `main` and create `openwork-v<version>` with the updater manifest and signatures. The matrix builds Apple Silicon and Intel macOS packages, Windows x64 installers, and Linux x64 AppImage/deb packages. Each matrix job runs the Rust and release-contract tests, verifies the bundled runtime, and starts the packaged application before publishing.

Published releases require `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PUBLIC_KEY`; set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` when the key is encrypted. macOS additionally requires `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, and `APPLE_API_KEY_P8_BASE64`; the existing `MAC_CSC_*` and `APPLE_NOTARY_*` names remain accepted. Windows requires a base64 PFX or HTTPS certificate URL in `WINDOWS_CERTIFICATE` plus `WINDOWS_CERTIFICATE_PASSWORD`; the existing `WIN_CSC_*` names remain accepted.

The updater public key is injected into release builds. Unsigned local and dry-run builds can compile and run, but cannot install release updates.
