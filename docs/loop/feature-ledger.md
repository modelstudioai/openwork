# Feature Ledger

Working memory for the autonomous desktop-feature loop. Each run appends or
updates a row here.

**GitHub is the source of truth.** At the start of every run the loop reconciles
this file against GitHub issues/PRs labeled `loop-bot`, so merge/close state is
authoritative there — this table is the loop's human-readable index and learning
log, not the system of record.

## Status legend

| status | meaning |
| --- | --- |
| reduce-motion | "Reduce motion" accessibility setting in Appearance | Claude desktop / macOS / Windows reduce-motion + `prefers-reduced-motion` | frontend-only | pr-open | [#50](https://github.com/modelstudioai/openwork/issues/50) | [#51](https://github.com/modelstudioai/openwork/pull/51) | loop/reduce-motion | 2026-07-03 | Renderer-only pref (localStorage) applied app-wide via `<MotionConfig reducedMotion>` + `data-reduce-motion` on `<html>` + global CSS guard. Off ⇒ `reducedMotion="user"` (still honors OS). New `ReduceMotionProvider` in `main.tsx`; toggle in Appearance→Interface; 2 new i18n keys ×7 locales. typecheck/`bun test` zero-delta vs main (56-failure set byte-identical); renderer build ✅; i18n parity ✅. CDP assertion included; **could not run locally** (egress 403s Electron binary download). |
| `proposed` | Identified as a gap, not started. |
| `in-progress` | Issue filed, branch open, implementation underway. |
| `pr-open` | PR submitted, awaiting human review/merge. |
| `merged` | PR merged — feature shipped. |
| `rejected` | PR closed **without** merging. Record **why** in Notes. |
| `blocked` | Not doable as a frontend-only change (needs qwen-code backend) or otherwise infeasible. Record **why**. |

## Selection rules

- Never pick a feature whose latest status is `merged`, `rejected`, `blocked`, or
  `in-progress`.
- `rejected` rows are **learning signals**: read the PR's close reason / review
  comments before considering the area again, and only retry with a clearly
  different and better approach.
- Keep the newest entries at the top.

## Ledger

| slug | title | source | feasibility | status | issue | pr | branch | updated | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| command-palette-recents | "Recently used" section in the Command Palette (⌘K) | VS Code ⌘⇧P / Raycast / Linear ⌘K / Claude Code Desktop command menu | frontend-only | pr-open | [#56](https://github.com/modelstudioai/openwork/issues/56) | [#57](https://github.com/modelstudioai/openwork/pull/57) | loop/command-palette-recents | 2026-07-05 | Palette (#42) had no memory of what you run. Adds a persisted recents list (`localStorage` `command-palette-recents`, dedupe/cap-6, newest-first) surfaced as a top "Recently used" group, hidden while searching. Pure `pushRecent` module + 6 unit tests (pass). One new i18n key `commands.recent` × 7 locales. typecheck/`bun test` zero-delta vs main (56 baseline fails on both, 0 new); renderer build ✅. **CDP could not run locally** (same env block as prior rounds: egress 403s Electron binary + `libsignal`/WhatsApp-worker dep) — assertion included for CI/reviewer. |
| thinking-menu-shortcut | Keyboard shortcut (⌘⇧E) to open the composer's thinking (effort) menu | Claude Code Desktop effort-menu shortcut (⌘⇧E); explicit follow-up flagged in #44 | frontend-only | pr-open | [#54](https://github.com/modelstudioai/openwork/issues/54) | [#55](https://github.com/modelstudioai/openwork/pull/55) | loop/thinking-menu-shortcut | 2026-07-04 | New `chat.openThinkingMenu` action (`mod+shift+e`) → scoped `craft:open-composer-menu` event → `FreeFormInput` opens its already-controlled `thinkingDropdownOpen`. Mirrors `craft:focus-input`/`shouldHandleScopedInputEvent` for multi-panel safety. Auto-appears in Command Palette + Shortcuts reference. 1 new i18n key across 7 locales. Avoids ⌘⇧I (reserved for DevTools) / ⌘⇧M (permission mode already has Shift+Tab). typecheck zero-delta (11 pre-existing); `bun test` zero-delta (56 identical failures, diffed vs main); i18n parity OK; renderer build ✅; assertion transpiles ✅. **CDP blocked locally** (same egress limit: `libsignal` GitHub dep + Electron binary 403). |
| prompt-history-recall | Recall previously-sent prompts in the composer with Up/Down arrows | Claude Code CLI `↑` history + Codex desktop "recover your previous prompt by pressing the up arrow" | frontend-only | pr-open | [#52](https://github.com/modelstudioai/openwork/issues/52) | [#53](https://github.com/modelstudioai/openwork/pull/53) | loop/composer-prompt-history | 2026-07-04 | New pure module `prompt-history.ts` (push/prev/next/entry-at) + global `localStorage['craft-prompt-history']`. Wired into `FreeFormInput.handleKeyDown`: Up recalls when composer empty/recalling, Down walks newer & restores draft, edit/submit/session-switch exit recall. Zero new i18n keys. `data-testid="composer-input"` added for e2e. **DoD:** typecheck:all +0 vs main (11 pre-existing electron errors only); packages/ui clean; `bun test` failure set byte-identical to main (56 pre-existing, verified by stash-diff) + 20 new passing unit tests; renderer build ✅; assertion transpiles. **CDP could not run locally** (egress 403s the Electron binary download, same as prior loop PRs) — assertion included for CI/reviewer. |
| reduce-motion | "Reduce motion" accessibility setting in Appearance | Claude desktop / macOS / Windows "Reduce motion" + `prefers-reduced-motion` | frontend-only | pr-open | [#50](https://github.com/modelstudioai/openwork/issues/50) | [#51](https://github.com/modelstudioai/openwork/pull/51) | (loop) | 2026-07-03 | Reconciled from GitHub: PR open, awaiting review. Not re-selectable. |
| composer-expand | Expand / collapse (maximize) toggle for the chat composer | Claude desktop / ChatGPT desktop / Codex desktop composer maximize | frontend-only | pr-open | [#48](https://github.com/modelstudioai/openwork/issues/48) | [#49](https://github.com/modelstudioai/openwork/pull/49) | (loop) | 2026-07-03 | Reconciled from GitHub: PR open, awaiting review. Not re-selectable. |
| scroll-to-bottom | "Jump to latest" (scroll-to-bottom) button in the chat transcript | Claude Code Desktop / ChatGPT desktop / Codex desktop jump-to-latest | frontend-only | pr-open | [#46](https://github.com/modelstudioai/openwork/issues/46) | [#47](https://github.com/modelstudioai/openwork/pull/47) | (loop) | 2026-07-02 | Reconciled from GitHub: PR open, awaiting review. Added a reusable `seed(profileDirs)` e2e hook. Not re-selectable. |
| cmd-f-search-bug | `Cmd+F` / `app.search` shortcut doesn't activate session search | Bug found while shipping command palette | frontend-only (bug) | blocked | [#43](https://github.com/modelstudioai/openwork/issues/43) | — | — | 2026-07-01 | Open bug, needs a seeded session to repro (headless sandbox has none). Tracked, not a feature-loop candidate. |
| thinking-level-picker | Thinking-level (reasoning effort) picker in the chat composer | Claude Code Desktop effort menu (⌘⇧E) + OpenWork's own model picker | frontend-only | merged | [#44](https://github.com/modelstudioai/openwork/issues/44) | [#45](https://github.com/modelstudioai/openwork/pull/45) | loop/thinking-level-picker | 2026-07-04 | **Merged** into `main` (reconciled from GitHub). `thinkingLevel`/`onThinkingLevelChange` were already plumbed to `FreeFormInput`; only the UI trigger was missing. Reuses `thinking.*` + `settings.ai.thinking` i18n keys (zero new keys). |
| command-palette | Global command palette (⌘K/Ctrl+K) to search & run any action | Claude Code Desktop ⌘K / VS Code & Codex ⌘⇧P / Linear ⌘K | frontend-only | merged | [#41](https://github.com/modelstudioai/openwork/issues/41) | [#42](https://github.com/modelstudioai/openwork/pull/42) | loop/command-palette | 2026-07-02 | Merged into `main`. Reuses action registry `execute()` + cmdk primitives; zero new i18n keys. CDP e2e 2/2 pass. typecheck/test +0 vs main. |
| settings-search | Searchable/filterable settings navigation | Claude Code Desktop / VS Code / Codex desktop settings search | frontend-only | merged | [#39](https://github.com/modelstudioai/openwork/issues/39) | [#40](https://github.com/modelstudioai/openwork/pull/40) | loop/settings-search | 2026-07-01 | Merged into `main`. Filters `SettingsNavigator` by title+description; reuses `common.search`/`common.noResultsFound` (no new locale keys). Also hardened `e2e/app.ts` teardown (per-launch profile dir + setsid process-group kill) so multiple CDP assertions run under headless xvfb. |
