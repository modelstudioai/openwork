#!/usr/bin/env bun
/**
 * End-to-end assertion runner.
 *
 * Discovers every `e2e/assertions/*.assert.ts` module, runs each against a fresh
 * isolated instance of the OpenWork app (driven over CDP), and reports a
 * pass/fail summary. Exits non-zero if any assertion fails, so it can gate a PR.
 *
 * Run with:  bun run e2e
 */

import { Glob } from 'bun';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { launchApp, type LaunchedApp } from './app';

const ROOT_DIR = join(import.meta.dir, '..');
const ASSERTIONS_DIR = join(import.meta.dir, 'assertions');
const SCREENSHOT_DIR = join(ROOT_DIR, '.e2e/screenshots');

/** Contract every assertion module must default-export. */
export interface Assertion {
  /** Human-readable description, shown in the report. */
  name: string;
  /** Drive the running app and throw if the expected behavior is missing. */
  run(app: LaunchedApp): Promise<void>;
}

/** Per-assertion wall-clock cap so a hung flow can't block the whole run. */
const PER_ASSERTION_TIMEOUT_MS = 90000;

interface AssertionResult {
  name: string;
  file: string;
  ok: boolean;
  durationMs: number;
  error?: string;
  screenshot?: string;
}

function slug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'assertion';
}

async function loadAssertions(): Promise<Array<{ file: string; assertion: Assertion }>> {
  const glob = new Glob('*.assert.ts');
  const found: Array<{ file: string; assertion: Assertion }> = [];
  for await (const file of glob.scan({ cwd: ASSERTIONS_DIR, absolute: true })) {
    const mod = (await import(file)) as { default?: Assertion };
    if (!mod.default?.name || typeof mod.default.run !== 'function') {
      throw new Error(`${file} must default-export an Assertion ({ name, run })`);
    }
    found.push({ file, assertion: mod.default });
  }
  found.sort((a, b) => a.file.localeCompare(b.file));
  return found;
}

async function runOne(file: string, assertion: Assertion): Promise<AssertionResult> {
  const start = Date.now();
  let app: LaunchedApp | undefined;
  try {
    app = await launchApp();
    const capturedApp = app;
    await Promise.race([
      assertion.run(capturedApp),
      Bun.sleep(PER_ASSERTION_TIMEOUT_MS).then(() => {
        throw new Error(`assertion exceeded ${PER_ASSERTION_TIMEOUT_MS}ms`);
      }),
    ]);
    return { name: assertion.name, file, ok: true, durationMs: Date.now() - start };
  } catch (err) {
    let screenshot: string | undefined;
    if (app) {
      try {
        mkdirSync(SCREENSHOT_DIR, { recursive: true });
        screenshot = join(SCREENSHOT_DIR, `${slug(assertion.name)}.png`);
        await app.session.screenshot(screenshot);
      } catch {
        screenshot = undefined;
      }
    }
    return {
      name: assertion.name,
      file,
      ok: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
      screenshot,
    };
  } finally {
    await app?.stop();
  }
}

async function main(): Promise<void> {
  const assertions = await loadAssertions();
  if (assertions.length === 0) {
    console.error('No assertions found in e2e/assertions/*.assert.ts');
    process.exit(1);
  }

  console.log(`\n🧪 Running ${assertions.length} e2e assertion(s)\n`);
  const results: AssertionResult[] = [];
  for (const { file, assertion } of assertions) {
    process.stdout.write(`  • ${assertion.name} ... `);
    const result = await runOne(file, assertion);
    results.push(result);
    if (result.ok) {
      console.log(`✅ (${result.durationMs}ms)`);
    } else {
      console.log(`❌ (${result.durationMs}ms)`);
      console.log(`      ${result.error}`);
      if (result.screenshot) console.log(`      screenshot: ${result.screenshot}`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${results.length} passed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ e2e runner crashed:', err);
  process.exit(1);
});
