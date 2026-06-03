# OpenWork

OpenWork is a desktop and headless agent workspace from Model Studio AI. It provides multi-session chat, source connections, skills, file previews, automations, and permission modes in a local-first application.

## Runtime

OpenWork runs agent sessions through an ACP-compatible local CLI runtime. The desktop app can use a bundled runtime for packaged builds or a local source checkout during development.

For normal desktop development, install dependencies and run the app from source. Runtime override details are intentionally kept in package scripts and build tooling so this README stays focused on OpenWork.

## Installation

```bash
bun install
bun run dev
```

## Common Commands

```bash
bun run typecheck:all
bun run test:shared
bun run dev
bun run server:start
```

## Building for Distribution

### Prerequisites

- [Bun](https://bun.sh) (see `.bun-version` for exact version)
- `bun install` to install all workspace dependencies

### Developer Build

Use this for local testing. It produces an ad-hoc signed app.

```bash
# macOS (arm64 + x64)
bun run electron:dist:dev:mac

# Windows
bun run electron:dist:dev:win

# Linux
bun run electron:dist:dev:linux
```

### Release Build

```bash
bun run electron:dist:mac
bun run electron:dist:win
bun run electron:dist:linux
```

Release builds require signing credentials via environment variables:

| Variable                      | Purpose                     |
| ----------------------------- | --------------------------- |
| `CSC_LINK`                    | Path to signing certificate |
| `APPLE_ID`                    | Apple ID for notarization   |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password       |
| `APPLE_TEAM_ID`               | Team ID for notarization    |

### Build Output

Artifacts are written to `apps/electron/release/`.

## CLI

```bash
bun run apps/cli/src/index.ts run "Hello from OpenWork"
bun run apps/cli/src/index.ts run --workspace-dir ./project "Summarize this repo"
```

The `run` command spawns a headless server, creates a temporary session, streams the response, and exits.

## Repository Layout

```text
apps/
  electron/     Desktop app
  cli/          Terminal client
  webui/        Web adapter
packages/
  shared/       Agent, config, prompts, sessions, sources
  server-core/  RPC handlers and session manager
  core/         Shared types
  ui/           Shared UI components
  session-tools-core/
  session-mcp-server/
scripts/        Build and packaging helpers
```

## Capabilities

- Multi-session inbox with streaming responses and tool visualization
- Model discovery through ACP
- MCP, REST API, and local filesystem sources
- Skills stored per workspace
- Permission modes for planning, asking before edits, and autonomous execution
- File attachments and in-app previews for images, PDFs, Office files, and diffs
- Event-driven automations and messaging integrations

## Acknowledgments

ModelStudio OpenWork is adapted and extended from the desktop architecture of [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss), which provides important foundations for the desktop app, session workspace, agent interaction model, and local-first experience.

OpenWork's technical foundation is [Qwen Code](https://github.com/QwenLM/qwen-code), whose agent runtime capabilities support code understanding, tool use, command execution, and engineering task workflows.

We are grateful to these open source projects for the foundations they provide to ModelStudio OpenWork.

## License

Apache 2.0. Third-party dependencies are listed in package manifests and are subject to their respective licenses.
