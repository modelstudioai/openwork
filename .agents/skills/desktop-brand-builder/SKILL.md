---
name: desktop-brand-builder
description: Generate a branded qwen-code desktop package from a minimal brandId and logo. Use when the user wants a custom, white-label, rebranded, ModelStudio/OpenWork/Qwen Code desktop client, installer, DMG/EXE/AppImage, or one-click brand build.
---

# Desktop Brand Builder

## Goal

Create a branded desktop package with the least user input possible. The user
should usually provide only:

```text
brandId: acme-ai
logo: /absolute/path/to/logo.png
website: https://acme.ai
```

`website` is optional. Do not ask for app name, app id, artifact name,
copyright, dock icon, renderer symbol, signing, or local installation unless
the user explicitly asks to override them.

## Input Rules

Required fields:

- `brandId`: must match `^[a-z][a-z0-9-]*$`
- `logo`: local file path; must exist

Optional overrides:

- `website`
- `appName`
- `appId`
- `target`: `mac`, `win`, `linux`, or `all`

If required input is missing, ask once:

```text
请提供：
brandId: 例如 acme-ai，只能小写字母、数字、短横线
logo: 本地 logo 文件路径
website: 可选
```

Once the required fields are present, proceed without a confirmation step.

## Derived Defaults

Infer missing values deterministically:

- `appName`: title-case the hyphen-separated `brandId`; `acme-ai` becomes
  `Acme AI`
- `appId`: if `website` has a valid host, reverse the host labels and append
  `.desktop`; `https://acme.ai` becomes `ai.acme.desktop`
- fallback `appId`: `app.<brandId>.desktop`
- `copyright`: `Copyright © <current year> <appName>`
- all brand images: generate icon, dock icon, and renderer symbol from `logo`

Use explicit user-provided override values as-is after basic validation.

## Build Workflow

Use an isolated build directory under the current working directory so user
changes in the current worktree are not mutated. Default to the qwen-code main
branch; do not clone from `craft-agents-oss`, OpenWork, or another local
checkout unless the user explicitly asks for that source:

```bash
BUILD_ROOT="$PWD/brand-builds/<brandId>-<timestamp>"
mkdir -p "$BUILD_ROOT"
git clone --branch main --single-branch \
  https://github.com/QwenLM/qwen-code.git \
  "$BUILD_ROOT/qwen-code"
cd "$BUILD_ROOT/qwen-code"
git checkout -B brand-<brandId> origin/main
```

If the branch fetch or checkout fails, stop and report the failure. Do not
continue as if `brand-<brandId>` was created.

Create a temporary `brand.json` in the build directory:

```json
{
  "brandId": "acme-ai",
  "logo": "/absolute/path/to/logo.png",
  "website": "https://acme.ai",
  "appName": "Acme AI",
  "appId": "ai.acme.desktop",
  "copyright": "Copyright © 2026 Acme AI"
}
```

Install repository and Tauri shell dependencies when missing:

```bash
npm install
cd packages/desktop-shell && npm install --workspaces=false
```

Then run this skill's bundled brand creation script:

```bash
cd /absolute/path/to/qwen-code
npx tsx .agents/skills/desktop-brand-builder/scripts/brand-create.ts \
  --desktop-root /absolute/path/to/qwen-code/packages/desktop-shell \
  --config /absolute/path/to/brand.json
```

The agent should not hand-edit Tauri icons, the renderer symbol, or
`tauri.conf.json` when this script is available. It generates icons with the
Tauri CLI and patches the visible bootstrap/Web Shell brand copy and deep-link
scheme. It disables the OpenWork updater endpoint so a white-label build cannot
install an OpenWork release; configure a brand-owned signed endpoint before
enabling updates.

Package with the current host target unless the user requested a target:

```bash
cd packages/desktop-shell
npm run build --workspaces=false -- --bundles dmg
npm run build --workspaces=false -- --bundles nsis
npm run build --workspaces=false -- --bundles appimage,deb
```

For `target: all`, run only targets supported by the current machine or CI
environment. Do not claim cross-platform artifacts were produced unless the
files exist.

## Validation

After packaging:

1. Confirm the expected artifact exists under
   `packages/desktop-shell/src-tauri/target/release/bundle/`.
2. Compute `sha256sum` or `shasum -a 256` for each artifact.
3. On macOS, run `hdiutil verify` for generated DMG files.
4. Report the artifact path, SHA-256, app name, app id, and build directory.

## Failure Handling

- Invalid `brandId`: show the regex and ask for a corrected value.
- Missing `logo`: ask for a valid local path.
- Missing bundled script: report that
  `.agents/skills/desktop-brand-builder/scripts/brand-create.ts` is missing,
  and include the expected command.
- Build failure: preserve the build directory, return the last useful error
  lines, and include the full log path or command that produced the failure.

Do not delete the build directory on failure.
