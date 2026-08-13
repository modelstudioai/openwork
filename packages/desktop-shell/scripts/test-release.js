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
  testReleaseWorkflow();
  testUpstreamDesktopHardening();
  testChecksumRefresh(path.join(root, 'checksums'));
  testVersionSynchronization(path.join(root, 'version'));
  console.log('OpenWork desktop release contract checks passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

function testUpstreamDesktopHardening() {
  const bootstrap = fs.readFileSync(
    path.join(packageDir, 'bootstrap', 'bootstrap.js'),
    'utf8',
  );
  const runtime = fs.readFileSync(
    path.join(packageDir, 'scripts', 'prepare-runtime.js'),
    'utf8',
  );
  const main = fs.readFileSync(
    path.join(packageDir, 'src-tauri', 'src', 'main.rs'),
    'utf8',
  );
  assert.match(bootstrap, /kind === 'starting' \? '' : currentWorkspace/);
  assert.match(runtime, /OPENWORK_DESKTOP_NODE_CACHE_DIR/);
  assert.ok(
    runtime.indexOf('replaceRuntime();') > runtime.indexOf('writeChecksums();'),
  );
  assert.match(main, /Duration::from_secs\(3\)/);
  assert.match(
    main,
    /app\.updater_builder\(\)\s*\.timeout\(UPDATE_CHECK_TIMEOUT\)/,
  );
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
  assert.equal(config.app?.macOSPrivateApi, true);
  assert.deepEqual(config.app?.security?.capabilities, [
    'bootstrap',
    'runtime',
    'pet',
  ]);
  const capabilities = Object.fromEntries(
    ['bootstrap', 'runtime', 'pet'].map((name) => [
      name,
      JSON.parse(
        fs.readFileSync(
          path.join(packageDir, 'src-tauri', 'capabilities', `${name}.json`),
          'utf8',
        ),
      ),
    ]),
  );
  assert.deepEqual(capabilities.bootstrap.webviews, ['main', 'local-control']);
  assert.ok(
    capabilities.bootstrap.permissions.includes('core:event:allow-listen'),
  );
  assert.ok(
    capabilities.bootstrap.permissions.includes('core:event:allow-unlisten'),
  );
  assert.deepEqual(capabilities.runtime.webviews, ['main']);
  assert.equal(capabilities.runtime.local, false);
  assert.deepEqual(capabilities.runtime.remote, {
    urls: ['http://127.0.0.1:*'],
  });
  assert.deepEqual(capabilities.pet.webviews, ['pet']);
  assert.deepEqual(config.app?.security?.assetProtocol, {
    enable: true,
    scope: ['$HOME/.qwen/pets/**'],
  });
  assert.equal(config.bundle?.createUpdaterArtifacts, false);
  assert.equal(
    config.bundle?.resources?.['../runtime/openwork'],
    'runtime/openwork',
  );
  assert.deepEqual(config.plugins?.['deep-link']?.desktop?.schemes, [
    'openwork',
  ]);
  assert.deepEqual(config.plugins?.updater?.endpoints, [
    'https://github.com/modelstudioai/openwork/releases/download/desktop-latest/latest.json',
  ]);
  assert.equal(typeof config.plugins?.updater?.pubkey, 'string');
  assert.equal(
    fs.existsSync(
      path.join(packageDir, 'src-tauri', 'tauri.openwork.conf.json'),
    ),
    false,
  );
}

function testReleaseWorkflow() {
  const releaseWorkflow = fs.readFileSync(
    path.join(
      packageDir,
      '..',
      '..',
      '.github',
      'workflows',
      'desktop-release.yml',
    ),
    'utf8',
  );
  const buildWorkflow = fs.readFileSync(
    path.join(
      packageDir,
      '..',
      '..',
      '.github',
      'workflows',
      'desktop-build.yml',
    ),
    'utf8',
  );
  const workflow = `${releaseWorkflow}\n${buildWorkflow}`;
  for (const expected of [
    'aarch64-apple-darwin',
    'x86_64-apple-darwin',
    'x86_64-pc-windows-msvc',
    'x86_64-unknown-linux-gnu',
    'tauri-apps/tauri-action@1deb371b0cd8bd54025b384f1cd735e725c4060f',
    'TAURI_SIGNING_PRIVATE_KEY',
    'APPLE_CERTIFICATE',
    'Import-PfxCertificate',
    'createUpdaterArtifacts: publish',
    'Run desktop tests',
    'Verify bundled runtime',
    'Smoke packaged application',
    'create-desktop-update-manifest.mjs',
    'SHA256SUMS.txt',
    'desktop-latest',
    'Sign bundled runtime binaries (macOS)',
    'Verify Windows signature',
    '.app.tar.gz',
  ]) {
    assert.ok(
      workflow.includes(expected),
      `Missing release contract: ${expected}`,
    );
  }
  const buildStart = releaseWorkflow.indexOf('  build:');
  const publishStart = releaseWorkflow.indexOf('  publish:');
  const dryRunJob = releaseWorkflow.slice(buildStart, publishStart);
  const publishJob = releaseWorkflow.slice(publishStart);
  assert.doesNotMatch(dryRunJob, /secrets/);
  assert.match(
    dryRunJob,
    /if: '?inputs\.dry_run == true'?[\s\S]*contents: '?read'?/,
  );
  assert.match(
    publishJob,
    /if: '?inputs\.dry_run == false'?[\s\S]*contents: '?write'?/,
  );
  assert.match(publishJob, /secrets: '?inherit'?/);
  assert.doesNotMatch(workflow, /uses: [^\n]+@(v\d|stable)\b/);
  assert.doesNotMatch(workflow, /push --force|force-with-lease/);
}

function testChecksumRefresh(directory) {
  fs.mkdirSync(path.join(directory, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'one.txt'), 'one');
  fs.writeFileSync(path.join(directory, 'nested', 'two.txt'), 'two');
  execFileSync(
    process.execPath,
    [
      path.join(packageDir, 'scripts', 'prepare-runtime.js'),
      '--refresh-checksums',
      directory,
    ],
    { stdio: 'pipe' },
  );
  const checksums = JSON.parse(
    fs.readFileSync(path.join(directory, 'checksums.json'), 'utf8'),
  );
  assert.deepEqual(Object.keys(checksums), ['nested/two.txt', 'one.txt']);
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
