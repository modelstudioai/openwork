# Maintaining OpenWork on Qwen Code

OpenWork is a standalone GitHub repository, not a GitHub fork. Its Git history nevertheless includes Qwen Code, which remains the upstream runtime and Web Shell. Keep that relationship explicit in Git and keep OpenWork-specific changes small enough to review after every upstream merge.

## Repository model

- `origin` is `https://github.com/modelstudioai/openwork`.
- `qwen-upstream` is `https://github.com/QwenLM/qwen-code.git` and is fetch-only for OpenWork maintenance.
- `main` is the released OpenWork line.
- OpenWork owns the Tauri shell, branding and customization, migration, desktop release configuration, and OpenWork-only channels.
- Shared CLI, daemon, SDK, and Web Shell behavior should stay compatible with Qwen Code. Put reusable fixes upstream when practical instead of maintaining a second implementation here.

Add the upstream remote once after cloning:

```bash
git remote add qwen-upstream https://github.com/QwenLM/qwen-code.git
git remote set-url --push qwen-upstream DISABLED
git config remote.qwen-upstream.tagOpt --no-tags
git fetch origin --prune
git fetch qwen-upstream --prune
```

`git remote set-url --push` prevents an accidental push to Qwen Code without changing normal fetches. Keeping upstream tags out also avoids collisions with OpenWork release tags.

## Syncing Qwen Code

Use a normal merge so both histories and the exact upstream commit remain visible. Do not rebase or force-push a published sync branch.

```bash
git fetch origin --prune
git fetch qwen-upstream --prune
git switch main
git pull --ff-only origin main
git switch -c chore/sync-qwen-code-YYYYMMDD
git merge --no-ff --no-commit qwen-upstream/main
```

Resolve conflicts by ownership:

- Prefer upstream for shared runtime, CLI, SDK, and Web Shell internals.
- Preserve OpenWork behavior in `packages/desktop-shell`, OpenWork customization under `packages/web-shell/client/openwork`, migration code, OpenWork channel adapters, and desktop release workflows.
- Review `package.json`, lockfiles, branding, application identifiers, updater endpoints, and release secrets rather than taking either side wholesale.
- Treat every added `.github/workflows/*.yml` file as unapproved until it is reviewed and added to `.github/scripts/openwork-workflows.test.mjs` with an explicit GitHub Actions state.

Do not push a sync branch that introduces an unreviewed workflow. Review every workflow change, run the workflow inventory test locally, and verify the repository-side state of retained disabled workflows with `gh workflow list --all`. The inventory test records reviewed files; GitHub stores whether each workflow is enabled or disabled.

After resolving conflicts, run the checks for the touched packages plus:

```bash
node --test .github/scripts/openwork-workflows.test.mjs
npm run build
npm run typecheck
```

Commit the reviewed merge, then open a PR to `main` that names the upstream before/after commits and lists every conflict resolution. After CI passes, use GitHub's **Create a merge commit** option. Squash and rebase merging are not valid for an upstream-sync PR because `main` must retain the Qwen commit as an ancestor for the next merge.

## Workflow policy

OpenWork intentionally enables only these workflows:

| Workflow              | Purpose                                                   |
| --------------------- | --------------------------------------------------------- |
| `ci.yml`              | Pull request, merge-queue, and manual source verification |
| `sdk-java.yml`        | Java SDK compatibility                                    |
| `sdk-python.yml`      | Python SDK compatibility                                  |
| `codeql.yml`          | Scheduled and manual source security analysis             |
| `desktop-build.yml`   | Reusable cross-platform installer build                   |
| `desktop-release.yml` | Manual dry-run or published desktop release               |

Qwen-specific jobs inside a retained workflow must also remain repository-gated. In particular, OpenWork's `ci.yml` does not run the model-backed merge-queue integration job because the repository does not own its `OPENAI_*` credentials.

These Qwen Code workflows remain checked in for upstream maintenance but are disabled in the `modelstudioai/openwork` GitHub Actions settings:

| Disabled workflow               | Why it is disabled                                                          | Enable only when                                             |
| ------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `audio-capture-prebuilds.yml`   | Produces an artifact for Qwen package publishing; OpenWork has no consumer  | An OpenWork release downloads and ships the artifact         |
| `docs-page-action.yml`          | The repository has no GitHub Pages site                                     | Pages is configured with an OpenWork-owned source and domain |
| `e2e.yml`                       | Scheduled jobs require model and Docker Hub credentials not configured here | OpenWork owns the credentials, cost, and failure rotation    |
| `main-ci-failure-issue.yml`     | Creates and assigns issues through Qwen bot labels and credentials          | OpenWork defines the bot, labels, and incident owner         |
| `npm-cache.yml`                 | Targets Qwen's `ecs-qwen` runner and feeds removed triage jobs              | OpenWork operates the runner and a real cache consumer       |
| `repo-hygiene.yml`              | Runs a model-backed agent with Qwen bot credentials and can open PRs        | OpenWork explicitly owns the bot and review policy           |
| `stale.yml`                     | Automatically mutates and closes contributor PRs under Qwen policy          | OpenWork maintainers approve a local stale policy            |
| `web-shell-visuals-cleanup.yml` | Only deletes Qwen asset branches                                            | OpenWork introduces the matching asset publisher             |
| `windows-runner-smoke.yml`      | Requires the unavailable `ecs-win` runner                                   | OpenWork registers and operates that runner                  |

Other Qwen release, publishing, issue, PR bot, mirror, and runner-maintenance workflows remain absent for the same ownership reason. They depend on Qwen-owned infrastructure, credentials, labels, artifact consumers, or repository policy.

To enable a disabled workflow, use a separate PR that documents its trigger, permissions, secrets, runners, owner, failure response, and artifact consumer, then run `gh workflow enable <filename> --repo modelstudioai/openwork`. A copied upstream workflow must never become active only because an upstream merge added the file.

## Day-to-day development

Start product work from current OpenWork `main` in a dedicated branch or worktree. Keep OpenWork UI and native integrations in their existing customization layers. If a change belongs to shared Qwen behavior, make it upstream-compatible and avoid introducing an OpenWork-only fork of the same runtime path.

The existing `npm run desktop-openwork-sync` command is a legacy, narrow tool for moving commits between the old `packages/desktop` trees. It is not an alternative to the whole-repository merge procedure above and should not be used for CLI, daemon, SDK, Web Shell, workflow, or Tauri updates.

Desktop development and release commands are documented in [`packages/desktop-shell/README.md`](../../packages/desktop-shell/README.md).
