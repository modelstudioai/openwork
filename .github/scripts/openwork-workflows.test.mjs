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

const allowedWorkflows = [
  'ci.yml',
  'codeql.yml',
  'desktop-build.yml',
  'desktop-release.yml',
  'sdk-java.yml',
  'sdk-python.yml',
];

describe('OpenWork workflow boundary', () => {
  it('requires every active workflow to be explicitly reviewed', () => {
    const workflows = readdirSync(workflowsDir)
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
      .sort();

    assert.deepEqual(workflows, allowedWorkflows);
  });
});
