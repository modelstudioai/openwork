# OpenWork Capability Inventory (baseline)

A snapshot of what the OpenWork desktop app **already does today**, grounded in
the current code. The autonomous feature loop diffs Claude Code Desktop / Codex
desktop features against this baseline to find genuine gaps — so a candidate that
maps to anything below is **not** a gap.

> Scope: the Electron frontend/shell only. The qwen-code backend (vendored from
> npm) is out of scope and must not be modified. Paths are representative anchors,
> not exhaustive.
>
> Maintenance: refresh this when a `loop-bot` PR ships a new capability, or
> periodically re-survey. Treat it as a fast index, not a contract.

## 1. Sessions & conversation
- Multi-session per workspace; create/delete/archive/flag; status (`todo`,
  `in_progress`, `needs_review`, `done`, `cancelled`); search & filter.
- Persisted history with message-level streaming, token-usage tracking, read/unread.
- Session export/import + cross-workspace resource bundles.
- `apps/electron/src/renderer/atoms/sessions.ts`, `packages/core/src/types/session.ts`

## 2. Chat & agent interaction UI
- Message bubbles (user/system), turn cards with actions, inline execution progress.
- Plan accept/reject UI; streaming incremental updates; token display.
- Auth-request cards for OAuth flows; tool-execution approval dialogs.
- **Permission modes (4):** `explore` / `ask` / `execute` / `auto-edit`.
- **Thinking levels (6):** off / low / medium / high / xhigh / max, with per-workspace defaults.
- `packages/ui/src/components/chat/*`, `packages/shared/src/agent/mode-types.ts`

## 3. File & artifact previews
- Code (Shiki highlight), diffs, JSON tree, HTML (sandboxed), Mermaid, LaTeX.
- PDF viewer, spreadsheet/Excel table (sort/filter/export), DOCX, PPTX, image gallery.
- Rich markdown: collapsible sections, table export (CSV/Excel), link preview overlay.
- `packages/ui/src/components/markdown/*`, `apps/electron/src/renderer/components/files/FileViewer.tsx`

## 4. Local project & workspace management
- Workspace types: `conversation` / `project`; multi-workspace; per-workspace config.
- File read (text/binary), directory listing/search, file watching, allowed-dir enforcement.
- Shell command execution with output capture, kill/terminate, shell-env loading (nvm/Homebrew).
- Worktree creation; per-session modified/new-file tracking; notes.
- `apps/electron/src/main/handlers/workspace.ts`, `apps/electron/src/main/shell-env.ts`

## 5. Integrations & data sources
- **MCP servers:** HTTP MCP connections, workspace-scoped OAuth / bearer auth, tool listing & execution.
- **Native OAuth:** Google, Slack, Microsoft (PKCE, refresh); plus a generic OAuth 2.0 client for any provider.
- **Local folder sources** as agent data sources; encrypted per-workspace credential store with health tracking.
- **Messaging adapters:** WhatsApp, Telegram (pairing/linking, inbound event fanout).
- `packages/shared/src/mcp/*`, `packages/shared/src/auth/*`, `packages/messaging-gateway/src/adapters/*`

## 6. Skills & extensibility
- `SKILL.md` (YAML frontmatter) format; metadata (name, description, icon, required sources, alwaysAllow tools).
- Multi-tier sourcing: global (`~/.agents/`), workspace, project (`.agents/`), provider.
- File-glob auto-trigger; tool allow-listing; enable/disable; marketplace discovery.
- `packages/shared/src/skills/*`

## 7. Settings & preferences
- Model selection per session/workspace; multiple LLM connections per provider; custom endpoints.
- Default + per-session permission mode; per-workspace thinking level.
- Theme (light/dark/system + presets), language (i18next), keep-awake, keyboard shortcuts.
- Network proxy (HTTP/HTTPS/SOCKS + auth).
- `apps/electron/src/main/handlers/settings.ts`, `packages/shared/src/config/*`

## 8. Window & UX features
- Multi-window (per-workspace), window-state persistence, close confirmation, deep links (`craftagents://`).
- **Pet window:** floating companion overlay, click-through, activity animations, notifications.
- **Embedded browser pane:** Chromium pane (dockable/floating) with navigate/back/forward/reload,
  JS eval, screenshot, form interaction, a11y snapshot, CDP integration, console/network logging.
- Theme system with per-workspace override; i18n; command palette / action registry; global shortcuts.
- `apps/electron/src/main/window-manager.ts`, `apps/electron/src/main/browser-pane-manager.ts`

## 9. Model & provider configuration
- Providers: Qwen (ModelStudio) primary; OpenAI-compatible custom endpoints; multi-connection.
- Model metadata (capabilities, context window, pricing) with lazy-load/caching.
- Auth: API key / OAuth / bearer / custom headers. Runtime proxy changes.
- `packages/shared/src/config/llm-connections.ts`, `packages/shared/src/config/model-fetcher.ts`

## 10. Auto-update & distribution
- electron-updater: macOS (DMG/zip + signature validation), Windows (NSIS), Linux (AppImage).
- Download progress, update notification, install-on-quit, skip-version, dev-build exclusion.
- macOS code-signing checks; brand-configurable update sources.
- Platforms: macOS (arm64/x64), Windows (x64/arm64), Linux (AppImage).
- `apps/electron/src/main/auto-update.ts`

## 11. Notifications
- Native OS notifications (focus-suppressed, click-to-navigate, workspace routing).
- macOS dock badge unread count (instance-aware); in-app Sonner toasts.
- `apps/electron/src/main/notifications.ts`

## 12. Other notable
- Deep linking / URL scheme actions (new-chat, resume/delete/flag session, navigate to settings/sources/skills).
- Session resource export/import; remote workspace support (WebSocket-proxied handlers, chunked RPC).
- Power management (keep-awake during runs); Sentry error tracking with redaction; onboarding/setup flow.
- `apps/electron/src/main/deep-link.ts`, `apps/electron/src/main/onboarding.ts`

---

_Generated as a baseline survey. Verify against current code before relying on any
single line — the app evolves and this index can lag._
