import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface BrandInput {
  brandId?: string;
  logo?: string;
  website?: string;
  appName?: string;
  appId?: string;
  copyright?: string;
}

interface BrandConfig {
  brandId: string;
  logo: string;
  website?: string;
  appName: string;
  appId: string;
  copyright: string;
}

const BRAND_ID_RE = /^[a-z][a-z0-9-]*$/;

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredPath(name: string): string {
  const value = argValue(name);
  if (!value) {
    throw new Error(
      'Usage: npx tsx brand-create.ts --desktop-root /path/to/packages/desktop-shell --config /path/to/brand.json',
    );
  }
  return resolve(value);
}

function titleWords(brandId: string): string[] {
  return brandId
    .split('-')
    .map((part) => part[0]!.toUpperCase() + part.slice(1));
}

function deriveAppId(website: string | undefined, brandId: string): string {
  try {
    const host = new URL(
      website?.includes('://') ? website : `https://${website}`,
    ).hostname.replace(/^www\./, '');
    const parts = host.split('.').filter(Boolean);
    if (parts.length >= 2) return `${parts.reverse().join('.')}.desktop`;
  } catch {
    // Use the deterministic fallback below.
  }
  return `app.${brandId}.desktop`;
}

function normalizeWebsite(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const url = new URL(
    value.includes('://') ? value.trim() : `https://${value.trim()}`,
  );
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new Error('website must be an HTTP(S) URL without credentials');
  }
  return url.toString();
}

function validateText(name: string, value: string, maxLength: number): string {
  if (!value || value.length > maxLength || /[\0\r\n]/.test(value)) {
    throw new Error(`${name} must be 1-${maxLength} characters on one line`);
  }
  return value;
}

function loadConfig(file: string): BrandConfig {
  const input = JSON.parse(readFileSync(file, 'utf8')) as BrandInput;
  const brandId = input.brandId?.trim();
  const logo = input.logo ? resolve(input.logo) : '';
  if (!brandId || !BRAND_ID_RE.test(brandId)) {
    throw new Error(`brandId must match ${BRAND_ID_RE}`);
  }
  if (!existsSync(logo)) {
    throw new Error(`Logo file not found: ${logo || '(missing)'}`);
  }
  const words = titleWords(brandId);
  const website = normalizeWebsite(input.website);
  const appName = validateText(
    'appName',
    input.appName?.trim() || words.join(' '),
    80,
  );
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(appName)) {
    throw new Error('appName may contain only letters, digits, spaces, ._-');
  }
  const appId = input.appId?.trim() || deriveAppId(website, brandId);
  if (!/^[A-Za-z0-9.-]+$/.test(appId) || !appId.includes('.')) {
    throw new Error(`Invalid Tauri appId: ${appId}`);
  }
  return {
    brandId,
    logo,
    website,
    appName,
    appId,
    copyright: validateText(
      'copyright',
      input.copyright?.trim() ||
        `Copyright © ${new Date().getFullYear()} ${appName}`,
      200,
    ),
  };
}

function run(command: [string, ...string[]], cwd: string): void {
  execFileSync(command[0], command.slice(1), { cwd, stdio: 'inherit' });
}

function replaceVisibleText(file: string, appName: string): void {
  if (!existsSync(file)) return;
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replaceAll('OpenWork', appName),
  );
}

function replaceQuotedText(file: string, appName: string): void {
  const source = readFileSync(file, 'utf8');
  writeFileSync(
    file,
    source.replace(/"(?:[^"\\]|\\.)*"/g, (value) =>
      value.replaceAll('OpenWork', appName),
    ),
  );
}

function replaceRequired(
  source: string,
  from: string,
  to: string,
  file: string,
): string {
  if (!source.includes(from)) {
    throw new Error(`Could not find ${JSON.stringify(from)} in ${file}`);
  }
  return source.replaceAll(from, to);
}

async function main(): Promise<void> {
  const desktopRoot = requiredPath('--desktop-root');
  const packageFile = join(desktopRoot, 'package.json');
  if (!existsSync(packageFile)) {
    throw new Error(`Tauri desktop package not found: ${desktopRoot}`);
  }
  const config = loadConfig(requiredPath('--config'));
  const repoRoot = resolve(desktopRoot, '../..');
  const requireFromRepo = createRequire(join(repoRoot, 'package.json'));
  const sharp = requireFromRepo('sharp') as typeof import('sharp');
  const symbol = join(desktopRoot, 'bootstrap', 'openwork-symbol.png');
  await sharp(config.logo)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(symbol);
  run(
    [
      'npx',
      'tauri',
      'icon',
      symbol,
      '--output',
      join(desktopRoot, 'src-tauri', 'icons'),
    ],
    desktopRoot,
  );

  const tauriConfigPath = join(desktopRoot, 'src-tauri', 'tauri.conf.json');
  const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
  tauriConfig.productName = config.appName;
  tauriConfig.identifier = config.appId;
  tauriConfig.bundle.shortDescription = `${config.appName} — AI agent workspace`;
  tauriConfig.bundle.copyright = config.copyright;
  tauriConfig.plugins['deep-link'].desktop.schemes = [config.brandId];
  tauriConfig.plugins.updater.endpoints = [];
  writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

  for (const file of [
    join(desktopRoot, 'bootstrap', 'index.html'),
    join(desktopRoot, 'bootstrap', 'bootstrap.js'),
    join(desktopRoot, 'bootstrap', 'local-control.html'),
    join(desktopRoot, 'bootstrap', 'pet.html'),
    join(desktopRoot, 'src-tauri', 'Info.plist'),
    join(desktopRoot, 'src-tauri', 'windows-app-manifest.xml'),
    join(repoRoot, 'packages', 'web-shell', 'client', 'index.html'),
    join(repoRoot, 'packages', 'web-shell', 'client', 'i18n.tsx'),
  ]) {
    replaceVisibleText(file, config.appName);
  }

  const rustMain = join(desktopRoot, 'src-tauri', 'src', 'main.rs');
  replaceQuotedText(rustMain, config.appName);
  let rustSource = replaceRequired(
    readFileSync(rustMain, 'utf8'),
    'openwork://',
    `${config.brandId}://`,
    rustMain,
  );
  if (config.website) {
    rustSource = rustSource.replaceAll(
      'https://github.com/modelstudioai/openwork',
      config.website,
    );
  }
  rustSource = replaceRequired(
    rustSource,
    'url.scheme() != "openwork"',
    `url.scheme() != "${config.brandId}"`,
    rustMain,
  );
  writeFileSync(rustMain, rustSource);

  const desktopLayer = join(
    repoRoot,
    'packages',
    'web-shell',
    'client',
    'openwork',
    'OpenWorkDesktopLayer.tsx',
  );
  let desktopSource = readFileSync(desktopLayer, 'utf8');
  desktopSource = replaceRequired(
    desktopSource,
    "url.protocol !== 'openwork:'",
    `url.protocol !== '${config.brandId}:'`,
    desktopLayer,
  );
  desktopSource = replaceRequired(
    desktopSource,
    "title: 'OpenWork'",
    `title: ${JSON.stringify(config.appName)}`,
    desktopLayer,
  );
  writeFileSync(desktopLayer, desktopSource);

  console.log(`Created Tauri brand ${config.brandId}`);
  console.log(`App name: ${config.appName}`);
  console.log(`App ID: ${config.appId}`);
  console.log(`Desktop root: ${desktopRoot}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
