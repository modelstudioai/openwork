#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: $0 [--in-place|--continue] <version>"
  echo "Example: $0 0.21.13"
}

mode=create
if [[ "${1:-}" == "--in-place" || "${1:-}" == "--continue" ]]; then
  mode="${1#--}"
  shift
fi

version="${1:-}"
if [[ -z "$version" || "${2:-}" != "" ]]; then
  usage >&2
  exit 2
fi
version="${version#v}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid stable Qwen Code version: $version" >&2
  exit 2
fi

tag="v$version"
remote="qwen-upstream"
remote_url="https://github.com/QwenLM/qwen-code.git"
repo_root="$(git rev-parse --show-toplevel)"
version_file="$repo_root/.qwen-upstream-version"
baseline_tag="v0.21.10"
if [[ -f "$version_file" ]]; then
  baseline_tag="$(<"$version_file")"
fi
state_ref="refs/openwork/qwen-sync/$tag"

finish_sync() {
  local base_head branch merge_commit tree final_commit conflicts
  base_head="$(git -C "$repo_root" rev-parse --verify "$state_ref" 2>/dev/null)" || {
    echo "No pending Qwen Code $tag sync found." >&2
    exit 1
  }
  conflicts="$(git -C "$repo_root" diff --name-only --diff-filter=U)"
  if [[ -n "$conflicts" ]]; then
    echo "Resolve and stage these conflicts first:" >&2
    echo "$conflicts" >&2
    exit 1
  fi
  if ! git -C "$repo_root" diff --quiet; then
    echo "Stage the resolved files before continuing." >&2
    exit 1
  fi
  if git -C "$repo_root" rev-parse --verify --quiet MERGE_HEAD >/dev/null; then
    git -C "$repo_root" commit -m "chore: sync Qwen Code $tag"
  fi
  branch="$(git -C "$repo_root" branch --show-current)"
  merge_commit="$(git -C "$repo_root" rev-parse HEAD)"
  tree="$(git -C "$repo_root" rev-parse 'HEAD^{tree}')"
  final_commit="$(printf 'chore: sync Qwen Code %s\n' "$tag" | git -C "$repo_root" commit-tree "$tree" -p "$base_head")"
  git -C "$repo_root" update-ref "refs/heads/$branch" "$final_commit" "$merge_commit"
  git -C "$repo_root" update-ref -d "$state_ref"
  echo "Qwen Code $tag synced on $branch."
}

if ! git -C "$repo_root" remote get-url "$remote" >/dev/null 2>&1; then
  git -C "$repo_root" remote add "$remote" "$remote_url"
fi

git -C "$repo_root" fetch origin main
git -C "$repo_root" fetch --no-tags "$remote" \
  "refs/tags/$baseline_tag:refs/tags/$baseline_tag"
if [[ "$tag" != "$baseline_tag" ]]; then
  git -C "$repo_root" fetch --no-tags "$remote" \
    "refs/tags/$tag:refs/tags/$tag"
fi

if [[ "$mode" == create ]]; then
  branch="cx/sync-qwen-$tag"
  worktree="$repo_root/.worktrees/openwork-qwen-$tag"
  if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch"; then
    echo "Branch already exists: $branch" >&2
    exit 1
  fi
  if [[ -e "$worktree" ]]; then
    echo "Worktree path already exists: $worktree" >&2
    exit 1
  fi
  git -C "$repo_root" worktree add -b "$branch" "$worktree" origin/main
  "$worktree/scripts/sync-qwen-release.sh" --in-place "$version"
  echo "Sync worktree: $worktree"
  exit 0
fi

branch="$(git -C "$repo_root" branch --show-current)"
if [[ -z "$branch" || "$branch" == "main" || "$branch" == "master" ]]; then
  echo "Run the sync on a feature branch, not $branch." >&2
  exit 1
fi

if [[ "$mode" == continue ]]; then
  finish_sync
  exit 0
fi

if [[ -n "$(git -C "$repo_root" status --porcelain)" ]]; then
  echo "Sync worktree must be clean: $repo_root" >&2
  exit 1
fi

if [[ "$tag" == "$baseline_tag" ]]; then
  echo "Qwen Code $tag is already synced."
  exit 0
fi

git -C "$repo_root" update-ref "$state_ref" HEAD
if ! git -C "$repo_root" merge-base HEAD "$tag" >/dev/null 2>&1; then
  git -C "$repo_root" merge --strategy=ours --no-ff \
    --allow-unrelated-histories \
    -m "chore: record Qwen Code $baseline_tag baseline" "$baseline_tag"
fi

before_merge="$(git -C "$repo_root" rev-parse HEAD)"
set +e
git -C "$repo_root" merge --no-ff --no-commit "$tag"
merge_status=$?
set -e

if ! git -C "$repo_root" rev-parse --verify --quiet MERGE_HEAD >/dev/null; then
  git -C "$repo_root" update-ref -d "$state_ref"
  exit "$merge_status"
fi

# OpenWork owns its public identity and CI policy; upstream code stays incremental.
for overlay in README.md TRADEMARK.md SECURITY.md .github/workflows; do
  git -C "$repo_root" rm -r -f --ignore-unmatch -- "$overlay" >/dev/null
  if git -C "$repo_root" cat-file -e "$before_merge:$overlay" 2>/dev/null; then
    git -C "$repo_root" checkout "$before_merge" -- "$overlay"
  fi
done

printf '%s\n' "$tag" >"$version_file"
git -C "$repo_root" add -- .qwen-upstream-version

conflicts="$(git -C "$repo_root" diff --name-only --diff-filter=U)"
if [[ -n "$conflicts" ]]; then
  echo "Qwen Code $tag fetched; resolve the remaining conflicts in $repo_root:" >&2
  echo "$conflicts" >&2
  echo "Then run: $0 --continue $version" >&2
  exit 1
fi

finish_sync
