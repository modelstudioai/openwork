# Electron-to-Tauri desktop update bridge

## Context

OpenWork Electron releases use GitHub's latest stable release and read `latest-mac.yml`, `latest.yml`, or `latest-linux.yml`. Tauri reads `latest.json` from the fixed `desktop-latest` release. A stable Tauri release must therefore publish both update formats, and the versioned release must remain GitHub Latest for legacy clients.

## Compatibility contract

OpenWork 0.2.0 keeps the Electron product name `OpenWork` and application identifier `com.alibaba.openwork`. With `electron_bridge` enabled, a release contains:

- `latest-mac.yml` plus versioned ZIP and DMG payloads for Apple Silicon and Intel;
- `latest.yml` plus the x64 NSIS installer for Windows;
- `latest-linux.yml` plus the x64 AppImage for Linux;
- `latest.json` and signed updater archives for Tauri clients.

The macOS ZIPs are created from the signed and notarized Tauri app. Windows removes the matching per-user Electron installation through its registered uninstaller before Tauri writes files, preserving user data and avoiding duplicate uninstall entries. Linux AppImage updates replace the current AppImage directly.

## Release usage

`Desktop Release` defaults `electron_bridge` to true. For a stable release, use `dry_run=false`, `draft=false`, and `prerelease=false`. A stable bridge release is marked GitHub Latest and updates the fixed Tauri feed. Keep the bridge enabled on later stable releases while Electron installations remain supported. Once support is intentionally retired, disable it; later Tauri-only releases use `--latest=false`, so the previous bridge release remains GitHub Latest for dormant Electron clients.

Before publishing, verify signed 0.1.4 clients on each platform can install the bridge and that the resulting Tauri app can then update to a newer Tauri release. Retire the bridge only after the legacy support window is explicitly closed.
