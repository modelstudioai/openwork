#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const versionScript = path.join(packageDir, 'scripts', 'version.js');
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openwork-desktop-release-test-'),
);

try {
  testDesktopConfiguration();
  testMacosPermissions();
  testVersionSynchronization(path.join(root, 'version'));
  console.log('OpenWork desktop release contract checks passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

function testDesktopConfiguration() {
  const config = JSON.parse(
    fs.readFileSync(
      path.join(packageDir, 'src-tauri', 'tauri.conf.json'),
      'utf8',
    ),
  );
  assert.equal(config.productName, 'OpenWork');
  assert.equal(config.identifier, 'com.alibaba.openwork');
  assert.equal(config.version, '0.1.0');
  assert.equal(config.build.devUrl, 'http://127.0.0.1:1420');
  assert.equal(config.build.frontendDist, '../bootstrap');
  assert.equal(config.app?.withGlobalTauri, true);
  assert.deepEqual(config.app?.security?.capabilities, ['bootstrap']);
  assert.equal(config.bundle?.createUpdaterArtifacts, false);
  assert.equal(
    config.bundle?.resources?.['../runtime/openwork'],
    'runtime/openwork',
  );
  assert.equal(config.plugins?.updater, undefined);
  assert.equal(
    fs.existsSync(
      path.join(packageDir, 'src-tauri', 'tauri.openwork.conf.json'),
    ),
    false,
  );
}

function testMacosPermissions() {
  const entitlements = fs.readFileSync(
    path.join(packageDir, 'src-tauri', 'Entitlements.plist'),
    'utf8',
  );
  assert.match(
    entitlements,
    /<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\/>/,
  );
  const info = fs.readFileSync(
    path.join(packageDir, 'src-tauri', 'Info.plist'),
    'utf8',
  );
  assert.match(
    info,
    /NSDocumentsFolderUsageDescription<\/key>\s*<string>OpenWork uses a folder in Documents/,
  );
  assert.match(
    info,
    /NSMicrophoneUsageDescription<\/key>\s*<string>OpenWork uses the microphone/,
  );
  assert.doesNotMatch(info, /Qwen Code/);
}

function testVersionSynchronization(directory) {
  fs.mkdirSync(path.join(directory, 'src-tauri'), { recursive: true });
  for (const relative of [
    'package.json',
    path.join('src-tauri', 'Cargo.toml'),
    path.join('src-tauri', 'tauri.conf.json'),
  ]) {
    fs.copyFileSync(
      path.join(packageDir, relative),
      path.join(directory, relative),
    );
  }
  execFileSync(process.execPath, [versionScript, '1.2.3'], {
    cwd: directory,
    env: { ...process.env, OPENWORK_DESKTOP_PACKAGE_DIR: directory },
  });
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
      .version,
    '1.2.3',
  );
  assert.equal(
    JSON.parse(
      fs.readFileSync(
        path.join(directory, 'src-tauri', 'tauri.conf.json'),
        'utf8',
      ),
    ).version,
    '1.2.3',
  );
  assert.match(
    fs.readFileSync(path.join(directory, 'src-tauri', 'Cargo.toml'), 'utf8'),
    /^version = "1\.2\.3"$/m,
  );
}
