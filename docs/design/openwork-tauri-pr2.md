# OpenWork Tauri PR2

## Context

PR1 established the target architecture: the OpenWork Tauri shell starts the
bundled `qwen serve` runtime and displays Qwen Web Shell. The old Electron
renderer and agent runtime remain historical evidence only.

PR2 closes the product gaps explicitly retained by the migration session. It
must be additive at the Web Shell and Tauri boundaries and must not fork Qwen's
session, model, attachment, voice, permission, worktree, skill, or channel
management implementations.

## Scope

### Web Shell product layer

- Add an OpenWork command palette on `Cmd/Ctrl+K` with six deduplicated recent
  commands.
- Add starter prompts.
- Add persistent appearance controls for 50–200% interface zoom, small/default/
  large chat text, comfortable/wide/full transcript widths, high contrast, and
  explicit reduced motion.
- Reuse all 15 historical OpenWork color themes and all seven shipped locales.
  Existing translated keys remain localized; new Qwen-only strings fall back to
  English until the legacy catalogs contain them.
- Add search to Settings and Keyboard Shortcuts.
- Preserve raw Markdown copy and surface both success and failure states.
- Add the three OpenWork curated skills to the existing Skills manager and use
  the daemon's existing install endpoint.
- Expose Telegram and WhatsApp in the existing Channels manager.

### Desktop integration

- Add a docked child webview for human browsing. Chat HTTP(S) links route to the
  dock while Qwen session links retain their current in-app behavior. Browser
  URLs and bounds are validated in Rust; browser content receives no Tauri IPC.
- Register `openwork://session/<id>` deep links and route only valid session IDs
  into the authenticated runtime origin.
- Send native completion notifications when a hidden window finishes a turn.
- Hold the browser Screen Wake Lock while a turn is active and release it when
  idle; unsupported platforms remain a safe no-op.
- Apply the resolved HTTP(S) proxy to the browser child webview and expose a
  redacted proxy status for verification.
- Add a transparent, always-on-top pet window using the existing OpenWork pet
  sprite, controlled from the native View menu and command palette. Discover
  additional pets from validated manifests under `~/.qwen/pets/`.
- Add native App/File/Edit/View/Window/Help menus, zoom actions, browser/pet
  actions, About/credits, repository links, and update checks.
- Bundle the eight historical document-tool launchers, their Python scripts,
  and a pinned `uv` executable. The daemon receives the same `CRAFT_UV`,
  `CRAFT_SCRIPTS`, and launcher `PATH` contract used by the Electron package.

### Data migration

- On first launch, import the active legacy workspace and appearance/pet
  preferences without changing the legacy state file.
- Copy native Qwen JSONL sessions into the corresponding Qwen project only when
  the destination does not exist, rewriting the working directory and
  preserving the parent chain and title.
- Archive legacy labels, status, sources, automations, and workspace metadata
  under `$QWEN_HOME/openwork-legacy-v1`, with a checksum report for audit and
  idempotence.
- Never copy or alter legacy encrypted credentials or Qwen OAuth credentials.
  Both desktop shells use the existing `$QWEN_HOME/oauth_creds.json`, so the
  active Qwen login survives the upgrade. Rollback removes only
  migration-created files whose checksums are unchanged.

### Channels

- Telegram gains serializable management metadata; its existing adapter remains
  unchanged.
- WhatsApp becomes a normal `ChannelPlugin` using Baileys directly in the Qwen
  daemon process. It persists auth state in the adapter state directory, emits
  pairing information through channel logs, routes text through `ChannelBase`,
  filters its own echoes, reconnects transient disconnects, and supports text
  replies. The old Electron subprocess and gateway are not restored.

### Release

- Enable Tauri updater artifacts and the OpenWork GitHub `latest.json` endpoint.
- Require the updater signing key for published builds.
- Build architecture-specific macOS DMG bundles, Windows NSIS, and
  Linux AppImage/deb artifacts with the official Tauri action.
- Use the existing Apple signing/notarization secrets and optional Windows
  signing secrets. Dry runs may be unsigned; published macOS builds may not.
- Remove release-branch force pushes and Electron artifact paths.

## Existing behavior reused as-is

- Qwen sessions, history, timeline, approvals, permissions, models/providers,
  attachments, voice, workspaces/worktrees, skills, agents, extensions, MCP,
  scheduled tasks, and channel lifecycle.
- Web Shell prompt history, jump-to-latest, raw assistant Markdown, safe external
  URL validation, blob downloads, single-instance handling, and window-state
  persistence.
- `qwen serve` remains the sole product runtime. No Electron IPC, BrowserView,
  updater, messaging gateway, or duplicated renderer package is reintroduced.

## Security and ownership

- Bootstrap-only commands continue to require the bootstrap origin.
- Runtime product commands require the exact authenticated runtime origin kept
  by `ApplicationState`; arbitrary web content cannot invoke them.
- Only `http` and `https` browser URLs are accepted. Deep links accept only the
  `openwork` scheme, `session` host, and a bounded session-ID path.
- The browser dock is owned by the main desktop window. It is hidden before the
  main webview navigates away and destroyed when the app exits.
- Updater signatures are mandatory and verified by Tauri before installation.
- WhatsApp auth state stays under the channel-owned state directory and is never
  returned through the management API.
- Custom pet IDs and sprite paths are validated and canonicalized inside the
  configured pet directory; only the pet window can resolve a sprite.
- Release secrets are exposed only to the validation/signing/build steps that
  need them, and only for published builds.

## Verification

- Focused Web Shell tests cover preferences, recents, the OpenWork settings
  surface, Markdown copy feedback, and worktree session creation.
- Channel tests cover Telegram metadata, WhatsApp message classification, and
  plugin registration.
- Rust tests cover URL/deep-link validation, proxy redaction, and browser bounds.
- Release contract tests assert updater configuration, OpenWork endpoints,
  supported bundle targets, signing inputs, and Tauri artifact paths.
- Migration tests cover copy/rewrite, archive checksums, idempotence, OAuth
  preservation, and rollback refusal after user modification.
- The packaged runtime smoke checks the pinned `uv`, document launchers, and
  migration entrypoint before daemon startup.
- Desktop smoke testing launches the bundled app and verifies its runtime health
  endpoint before shutdown.
