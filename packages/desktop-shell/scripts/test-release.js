#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const versionScript = path.join(packageDir, 'scripts', 'version.js');
const electronBridgeScript = path.join(
  packageDir,
  '..',
  '..',
  '.github',
  'scripts',
  'create-electron-bridge-manifest.mjs',
);
const root = fs.mkdtempSync(
  path.join(os.tmpdir(), 'openwork-desktop-release-test-'),
);

try {
  testDesktopConfiguration();
  await testBootstrapStartup();
  testMacosPermissions();
  testReleaseWorkflow();
  testRuntimePreparationContract();
  testElectronBridgeManifest(path.join(root, 'electron-bridge'));
  testChecksumRefresh(path.join(root, 'checksums'));
  testVersionSynchronization(path.join(root, 'version'));
  console.log('OpenWork desktop release contract checks passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

async function testBootstrapStartup() {
  const html = fs.readFileSync(
    path.join(packageDir, 'bootstrap', 'index.html'),
    'utf8',
  );
  assert.match(html, /<body data-state="starting">/);
  assert.match(html, /body\[data-state='starting'\] \.status/);
  assert.match(html, /class="mark" src="\.\/openwork-symbol\.png"/);

  const elements = {};
  const element = (selector) => {
    elements[selector] ??= {
      addEventListener(event, listener) {
        this.listeners ??= {};
        this.listeners[event] = listener;
      },
      style: {},
    };
    return elements[selector];
  };
  const listeners = {};
  const body = { dataset: {} };
  let resolveBootstrapState;
  vm.runInNewContext(
    fs.readFileSync(path.join(packageDir, 'bootstrap', 'bootstrap.js'), 'utf8'),
    {
      document: { body, querySelector: element },
      window: {
        __TAURI__: {
          core: {
            invoke: async (command) => {
              if (command !== 'bootstrap_state') return undefined;
              return new Promise((resolve) => {
                resolveBootstrapState = resolve;
              });
            },
          },
          event: {
            listen: async (event, listener) => {
              listeners[event] = listener;
            },
          },
        },
      },
    },
    { timeout: 5000 },
  );
  await new Promise((resolve) => setImmediate(resolve));

  listeners['runtime-starting']({ payload: '/tmp/attempted' });
  assert.equal(body.dataset.state, 'starting');
  assert.equal(element('#workspace').hidden, true);
  listeners['runtime-failed']({ payload: 'failed' });
  resolveBootstrapState({
    desktopVersion: '0.2.0',
    status: 'idle',
    workspace: '/tmp/persisted',
    error: 'failed',
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(body.dataset.state, 'error');
  assert.equal(element('#workspace').hidden, false);
  assert.equal(element('#workspace').textContent, '/tmp/attempted');
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
  assert.equal(config.version, '0.2.0');
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
    config.bundle?.windows?.nsis?.installerHooks,
    'windows/electron-migration.nsh',
  );
  const migrationHook = fs.readFileSync(
    path.join(packageDir, 'src-tauri', 'windows', 'electron-migration.nsh'),
    'utf8',
  );
  assert.match(migrationHook, /Software\\d6bd5575-5bf2-5dad-acfe-35e3bbeefd68/);
  assert.match(
    migrationHook,
    /ExecWait '"\$R0\\Uninstall OpenWork\.exe" \/currentuser \/S --updated _\?=\$R0'/,
  );
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
    'create-electron-bridge-manifest.mjs',
    'macos:latest-mac.yml',
    'windows:latest.yml',
    'linux:latest-linux.yml',
    'electron_bridge',
    'default: true',
    'args+=(--latest)',
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

function testElectronBridgeManifest(directory) {
  const assets = path.join(directory, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  const artifacts = [
    'OpenWork_0.2.0_arm64.zip',
    'OpenWork_0.2.0_x64.zip',
    'OpenWork_0.2.0_arm64.dmg',
    'OpenWork_0.2.0_x64.dmg',
    'OpenWork_0.2.0_x64-setup.exe',
    'OpenWork_0.2.0_amd64.AppImage',
  ];
  for (const artifact of artifacts) {
    fs.writeFileSync(path.join(assets, artifact), `contents:${artifact}`);
  }
  for (const [platform, filename, selected] of [
    ['macos', 'latest-mac.yml', artifacts.slice(0, 4)],
    ['windows', 'latest.yml', artifacts.slice(4, 5)],
    ['linux', 'latest-linux.yml', artifacts.slice(5, 6)],
  ]) {
    const output = path.join(directory, filename);
    execFileSync(process.execPath, [
      electronBridgeScript,
      '--assets',
      assets,
      '--platform',
      platform,
      '--version',
      '0.2.0',
      '--output',
      output,
    ]);
    const manifest = fs.readFileSync(output, 'utf8');
    assert.match(manifest, /^version: 0\.2\.0$/m);
    for (const artifact of selected) {
      const contents = fs.readFileSync(path.join(assets, artifact));
      const sha512 = crypto
        .createHash('sha512')
        .update(contents)
        .digest('base64');
      assert.ok(manifest.includes(`url: ${artifact}`));
      assert.ok(manifest.includes(`sha512: ${sha512}`));
      assert.ok(manifest.includes(`size: ${contents.length}`));
    }
  }

  fs.rmSync(path.join(assets, artifacts[1]));
  const failure = spawnSync(
    process.execPath,
    [
      electronBridgeScript,
      '--assets',
      assets,
      '--platform',
      'macos',
      '--version',
      '0.2.0',
      '--output',
      path.join(directory, 'latest-mac.yml'),
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(failure.status, 0);
  assert.match(failure.stderr, /Expected one Electron bridge artifact/);
}

function testRuntimePreparationContract() {
  const source = fs.readFileSync(
    path.join(packageDir, 'scripts', 'prepare-runtime.js'),
    'utf8',
  );
  assert.match(source, /QWEN_DESKTOP_NODE_CACHE_DIR/);
  assert.match(
    source,
    /const finalPackageRoot = path\.join\(runtimeDir, 'openwork'\)/,
  );
  assert.ok(
    source.indexOf('replaceRuntime();') > source.indexOf('writeChecksums();'),
  );
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
