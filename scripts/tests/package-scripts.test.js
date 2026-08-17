/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

function readPackageJson() {
  return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
}

describe('package scripts', () => {
  it('keeps the serve fast-path bundle check outside unit test scripts', () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts['test:ci']).not.toContain(
      'npm run check:serve-fast-path-bundle',
    );
    expect(packageJson.scripts.preflight).toContain(
      'npm run check:serve-fast-path-bundle',
    );
  });

  it('limits SDK integration tests through the forks pool', () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts['test:integration:sdk:sandbox:none']).toContain(
      '--poolOptions.forks.maxForks 2',
    );
    expect(
      packageJson.scripts['test:integration:sdk:sandbox:docker'],
    ).toContain('--poolOptions.forks.maxForks 2');
  });

  it('cleans package build artifacts before checking the serve fast path bundle', () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts['check:serve-fast-path-bundle']).toBe(
      [
        'node scripts/clean-package-build-artifacts.js',
        '&& npm run build -- --cli-only',
        '&& cross-env DEV=true npm run bundle',
        '&& node scripts/check-serve-fast-path-bundle.js',
      ].join(' '),
    );
    expect(packageJson.scripts['check:serve-fast-path-bundle']).not.toContain(
      'npm run clean',
    );
  });

  it('defines a release test script that disables workspace coverage', () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts['test:release']).toBe(
      [
        'cross-env NODE_OPTIONS="--max-old-space-size=3072"',
        'npm run test:ci --workspaces --if-present --parallel -- --coverage.enabled=false',
        '&& npm run test:scripts',
      ].join(' '),
    );

    const vscodePackageJson = JSON.parse(
      readFileSync(
        path.join(root, 'packages/vscode-ide-companion/package.json'),
        'utf8',
      ),
    );
    expect(vscodePackageJson.scripts['test:ci']).toContain('--coverage');
  });

  it('skips build/bundle/husky but still generates git-commit info when CI builds explicitly', () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts.prepare).toBe('node scripts/prepare.js');

    const binDir = mkdtempSync(path.join(tmpdir(), 'qwen-prepare-skip-'));
    const logFile = path.join(binDir, 'commands.log');
    writeFileSync(logFile, '');

    try {
      if (process.platform === 'win32') {
        writeFileSync(
          path.join(binDir, 'husky.cmd'),
          '@echo(husky>>"%PREPARE_LOG_FILE%"\r\n',
        );
        writeFileSync(
          path.join(binDir, 'npm.cmd'),
          '@echo(npm %*>>"%PREPARE_LOG_FILE%"\r\n',
        );
      } else {
        writeFileSync(
          path.join(binDir, 'husky'),
          '#!/bin/sh\necho husky >> "$PREPARE_LOG_FILE"\n',
        );
        writeFileSync(
          path.join(binDir, 'npm'),
          '#!/bin/sh\necho "npm $*" >> "$PREPARE_LOG_FILE"\n',
        );
        chmodSync(path.join(binDir, 'husky'), 0o755);
        chmodSync(path.join(binDir, 'npm'), 0o755);
      }

      const result = spawnSync(
        process.execPath,
        [path.join(root, 'scripts/prepare.js')],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
            PREPARE_LOG_FILE: logFile,
            QWEN_SKIP_PREPARE: '1',
          },
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Skipping prepare');
      // git-commit info is still generated so a later per-workspace build or
      // typecheck (e.g. the review tooling's) doesn't fail on the missing
      // module; the heavy build/bundle/husky are skipped.
      expect(readFileSync(logFile, 'utf8').trim().split(/\r?\n/)).toEqual([
        'npm run generate',
      ]);
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  });

  it('runs prepare steps in order when CI does not skip prepare', () => {
    const binDir = mkdtempSync(path.join(tmpdir(), 'qwen-prepare-bin-'));
    const logFile = path.join(binDir, 'commands.log');

    try {
      if (process.platform === 'win32') {
        writeFileSync(
          path.join(binDir, 'husky.cmd'),
          '@echo(husky>>"%PREPARE_LOG_FILE%"\r\n',
        );
        writeFileSync(
          path.join(binDir, 'npm.cmd'),
          '@echo(npm %*>>"%PREPARE_LOG_FILE%"\r\n',
        );
      } else {
        writeFileSync(
          path.join(binDir, 'husky'),
          '#!/bin/sh\necho husky >> "$PREPARE_LOG_FILE"\n',
        );
        writeFileSync(
          path.join(binDir, 'npm'),
          '#!/bin/sh\necho "npm $*" >> "$PREPARE_LOG_FILE"\n',
        );
        chmodSync(path.join(binDir, 'husky'), 0o755);
        chmodSync(path.join(binDir, 'npm'), 0o755);
      }

      const result = spawnSync(
        process.execPath,
        [path.join(root, 'scripts/prepare.js')],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
            PREPARE_LOG_FILE: logFile,
            QWEN_SKIP_PREPARE: '',
          },
        },
      );

      expect(result.status).toBe(0);
      expect(readFileSync(logFile, 'utf8').trim().split(/\r?\n/)).toEqual([
        'husky',
        'npm run build',
        'npm run bundle',
      ]);
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  });

  it('exits when a prepare step fails', () => {
    const binDir = mkdtempSync(path.join(tmpdir(), 'qwen-prepare-fail-'));
    const logFile = path.join(binDir, 'commands.log');
    writeFileSync(logFile, '');

    try {
      if (process.platform === 'win32') {
        writeFileSync(path.join(binDir, 'husky.cmd'), '@exit /b 7\r\n');
        writeFileSync(
          path.join(binDir, 'npm.cmd'),
          '@echo npm %* >> "%PREPARE_LOG_FILE%"\r\n',
        );
      } else {
        writeFileSync(path.join(binDir, 'husky'), '#!/bin/sh\nexit 7\n');
        writeFileSync(
          path.join(binDir, 'npm'),
          '#!/bin/sh\necho "npm $*" >> "$PREPARE_LOG_FILE"\n',
        );
        chmodSync(path.join(binDir, 'husky'), 0o755);
        chmodSync(path.join(binDir, 'npm'), 0o755);
      }

      const result = spawnSync(
        process.execPath,
        [path.join(root, 'scripts/prepare.js')],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
            PREPARE_LOG_FILE: logFile,
            QWEN_SKIP_PREPARE: '',
          },
        },
      );

      expect(result.status).toBe(7);
      expect(result.stderr).toContain('prepare: husky exited with status 7');
      expect(readFileSync(logFile, 'utf8')).toBe('');
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  });

  it('reports the failing prepare step after earlier steps succeed', () => {
    const binDir = mkdtempSync(path.join(tmpdir(), 'qwen-prepare-late-fail-'));
    const logFile = path.join(binDir, 'commands.log');
    writeFileSync(logFile, '');

    try {
      if (process.platform === 'win32') {
        writeFileSync(
          path.join(binDir, 'husky.cmd'),
          '@echo(husky>>"%PREPARE_LOG_FILE%"\r\n',
        );
        writeFileSync(
          path.join(binDir, 'npm.cmd'),
          [
            '@echo(npm %*>>"%PREPARE_LOG_FILE%"',
            '@if "%1 %2"=="run build" exit /b 7',
            '@exit /b 0',
            '',
          ].join('\r\n'),
        );
      } else {
        writeFileSync(
          path.join(binDir, 'husky'),
          '#!/bin/sh\necho husky >> "$PREPARE_LOG_FILE"\n',
        );
        writeFileSync(
          path.join(binDir, 'npm'),
          [
            '#!/bin/sh',
            'echo "npm $*" >> "$PREPARE_LOG_FILE"',
            'if [ "$1 $2" = "run build" ]; then exit 7; fi',
            '',
          ].join('\n'),
        );
        chmodSync(path.join(binDir, 'husky'), 0o755);
        chmodSync(path.join(binDir, 'npm'), 0o755);
      }

      const result = spawnSync(
        process.execPath,
        [path.join(root, 'scripts/prepare.js')],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
            PREPARE_LOG_FILE: logFile,
            QWEN_SKIP_PREPARE: '',
          },
        },
      );

      expect(result.status).toBe(7);
      expect(result.stderr).toContain(
        'prepare: npm run build exited with status 7',
      );
      expect(readFileSync(logFile, 'utf8').trim().split(/\r?\n/)).toEqual([
        'husky',
        'npm run build',
      ]);
    } finally {
      rmSync(binDir, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')(
    'reports when a prepare command is killed by a signal',
    () => {
      const binDir = mkdtempSync(path.join(tmpdir(), 'qwen-prepare-signal-'));

      try {
        writeFileSync(path.join(binDir, 'husky'), '#!/bin/sh\nkill -TERM $$\n');
        writeFileSync(path.join(binDir, 'npm'), '#!/bin/sh\nexit 0\n');
        chmodSync(path.join(binDir, 'husky'), 0o755);
        chmodSync(path.join(binDir, 'npm'), 0o755);

        const result = spawnSync(
          process.execPath,
          [path.join(root, 'scripts/prepare.js')],
          {
            cwd: root,
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
              QWEN_SKIP_PREPARE: '',
            },
          },
        );

        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
          'prepare: husky killed by signal SIGTERM',
        );
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform === 'win32')(
    'reports when a prepare command cannot be spawned',
    () => {
      const missingBinDir = mkdtempSync(
        path.join(tmpdir(), 'qwen-prepare-missing-bin-'),
      );

      try {
        const result = spawnSync(
          process.execPath,
          [path.join(root, 'scripts/prepare.js')],
          {
            cwd: root,
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: missingBinDir,
              QWEN_SKIP_PREPARE: '',
            },
          },
        );

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('prepare: husky failed:');
      } finally {
        rmSync(missingBinDir, { recursive: true, force: true });
      }
    },
  );
});
