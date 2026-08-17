#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const migration = path.join(packageDir, 'migration', 'openwork-migrate.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openwork-migration-test-'));
const legacy = path.join(root, 'legacy');
const workspace = path.join(root, 'workspace');
const sourceCwd = path.join(root, 'source-project');
const targetCwd = path.join(root, 'target-project');
const qwen = path.join(root, 'qwen');
const sessionId = '5ebd99ba-6453-43f5-b2c4-337ea7128fb8';

try {
  for (const directory of [legacy, workspace, sourceCwd, targetCwd, qwen]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(
    path.join(legacy, 'config.json'),
    JSON.stringify({
      activeWorkspaceId: 'legacy',
      workspaces: [{ id: 'legacy', rootPath: workspace }],
    }),
  );
  fs.writeFileSync(
    path.join(workspace, 'config.json'),
    JSON.stringify({ defaults: { workingDirectory: targetCwd } }),
  );
  fs.mkdirSync(path.join(workspace, 'labels'));
  fs.writeFileSync(
    path.join(workspace, 'labels', 'config.json'),
    '{"labels":[]}',
  );
  fs.mkdirSync(path.join(workspace, 'sources'));
  fs.writeFileSync(
    path.join(workspace, 'sources', 'config.json'),
    '{"sources":[]}',
  );
  fs.writeFileSync(
    path.join(workspace, 'sources', '.credential-cache.json'),
    '{"token":"do-not-copy"}',
  );
  const legacySessionDir = path.join(workspace, 'sessions', sessionId);
  fs.mkdirSync(legacySessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(legacySessionDir, 'session.jsonl'),
    `${JSON.stringify({ id: sessionId, sdkSessionId: sessionId, sdkCwd: sourceCwd, name: 'Migrated task' })}\n`,
  );
  const source = sessionPath(sourceCwd);
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(
    source,
    [
      {
        uuid: 'first',
        parentUuid: null,
        sessionId,
        timestamp: '2026-01-01T00:00:00.000Z',
        type: 'user',
        cwd: sourceCwd,
        version: '0.21.10',
        message: { role: 'user', parts: [{ text: 'hello' }] },
      },
      {
        uuid: 'second',
        parentUuid: 'first',
        sessionId,
        timestamp: '2026-01-01T00:00:01.000Z',
        type: 'assistant',
        cwd: sourceCwd,
        version: '0.21.10',
        message: { role: 'assistant', parts: [{ text: 'hi' }] },
      },
    ]
      .map(JSON.stringify)
      .join('\n') + '\n',
  );
  const malformedSessionId = 'malformed-session';
  const malformedLegacyDir = path.join(
    workspace,
    'sessions',
    malformedSessionId,
  );
  fs.mkdirSync(malformedLegacyDir, { recursive: true });
  fs.writeFileSync(
    path.join(malformedLegacyDir, 'session.jsonl'),
    `${JSON.stringify({ sdkSessionId: malformedSessionId, sdkCwd: sourceCwd })}\n`,
  );
  const malformedSource = sessionPath(sourceCwd, malformedSessionId);
  fs.mkdirSync(path.dirname(malformedSource), { recursive: true });
  fs.writeFileSync(malformedSource, 'null\n');
  const oauth = path.join(qwen, 'oauth_creds.json');
  fs.writeFileSync(oauth, 'do-not-touch');
  const oauthHash = hash(oauth);
  const sourceHash = hash(source);
  const destination = sessionPath(targetCwd);

  if (process.platform !== 'win32' && process.getuid?.() !== 0) {
    const sessions = path.join(workspace, 'sessions');
    fs.chmodSync(sessions, 0o000);
    try {
      assert.throws(() => run());
    } finally {
      fs.chmodSync(sessions, 0o700);
    }
    assert.equal(
      fs.existsSync(path.join(qwen, 'openwork-migration-v1.json')),
      false,
    );
    const unreadable = path.join(workspace, 'sources', 'unreadable.json');
    fs.writeFileSync(unreadable, '{}', { mode: 0o000 });
    try {
      assert.throws(() => run());
    } finally {
      fs.chmodSync(unreadable, 0o600);
      fs.rmSync(unreadable);
    }
    const journal = JSON.parse(
      fs.readFileSync(path.join(qwen, 'openwork-migration-v1.json'), 'utf8'),
    );
    assert.equal(journal.migratedAt, undefined);
    assert.ok(
      journal.createdFiles.some(
        (entry) => entry.path === path.relative(qwen, destination),
      ),
    );
    run('--rollback');
    assert.equal(fs.existsSync(destination), false);
    run();
    assert.equal(fs.existsSync(destination), false);
    fs.rmSync(path.join(qwen, 'openwork-migration-v1.json'));
  }
  run();
  const records = fs
    .readFileSync(destination, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.ok(records.every((record) => record.cwd === targetCwd));
  assert.equal(records.at(-1).systemPayload.customTitle, 'Migrated task');
  assert.equal(hash(source), sourceHash);
  assert.equal(hash(oauth), oauthHash);
  const archivedLabel = path.join(
    qwen,
    'openwork-legacy-v1',
    'legacy',
    'labels',
    'config.json',
  );
  assert.ok(fs.existsSync(archivedLabel));
  assert.equal(
    fs.existsSync(
      path.join(
        qwen,
        'openwork-legacy-v1',
        'legacy',
        'sources',
        '.credential-cache.json',
      ),
    ),
    false,
  );
  assert.equal(
    fs.existsSync(sessionPath(targetCwd, malformedSessionId)),
    false,
  );

  const destinationHash = hash(destination);
  run();
  assert.equal(hash(destination), destinationHash);

  if (process.platform !== 'win32') {
    const archivedSource = path.join(
      qwen,
      'openwork-legacy-v1',
      'legacy',
      'sources',
      'config.json',
    );
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.copyFileSync(archivedSource, path.join(outside, 'config.json'));
    fs.rmSync(path.dirname(archivedSource), { recursive: true });
    fs.symlinkSync(outside, path.dirname(archivedSource), 'dir');
  }
  fs.writeFileSync(archivedLabel, 'user changed this');
  run('--rollback');
  assert.equal(fs.existsSync(destination), false);
  assert.equal(fs.readFileSync(archivedLabel, 'utf8'), 'user changed this');
  if (process.platform !== 'win32') {
    assert.equal(
      fs.existsSync(path.join(root, 'outside', 'config.json')),
      true,
    );
  }
  assert.equal(hash(oauth), oauthHash);
  assert.ok(
    JSON.parse(
      fs.readFileSync(path.join(qwen, 'openwork-migration-v1.json'), 'utf8'),
    ).rolledBackAt,
  );
  const report = path.join(qwen, 'openwork-migration-v1.json');
  fs.writeFileSync(report, '{broken');
  assert.throws(() => run());
  fs.rmSync(report);
  fs.writeFileSync(path.join(legacy, 'config.json'), '{broken');
  assert.throws(() => run());
  assert.equal(fs.existsSync(report), false);
  console.log('OpenWork migration and rollback checks passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

function run(...args) {
  execFileSync(process.execPath, [migration, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      OPENWORK_LEGACY_CONFIG_DIR: legacy,
      QWEN_HOME: qwen,
    },
  });
}

function sessionPath(cwd, id = sessionId) {
  const project = process.platform === 'win32' ? cwd.toLowerCase() : cwd;
  return path.join(
    qwen,
    'projects',
    project.replace(/[^a-zA-Z0-9]/g, '-'),
    'chats',
    `${id}.jsonl`,
  );
}

function hash(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}
