import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const workflowsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'workflows',
);

const reviewedWorkflows = [
  'audio-capture-prebuilds.yml',
  'ci.yml',
  'codeql.yml',
  'desktop-build.yml',
  'desktop-release.yml',
  'docs-page-action.yml',
  'e2e.yml',
  'main-ci-failure-issue.yml',
  'npm-cache.yml',
  'repo-hygiene.yml',
  'sdk-java.yml',
  'sdk-python.yml',
  'stale.yml',
  'web-shell-visuals-cleanup.yml',
  'windows-runner-smoke.yml',
];

describe('OpenWork workflow boundary', () => {
  it('requires every checked-in workflow to be explicitly reviewed', () => {
    const workflows = readdirSync(workflowsDir)
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
      .sort();

    assert.deepEqual(workflows, reviewedWorkflows);
  });
});
