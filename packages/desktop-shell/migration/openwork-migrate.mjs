#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const VERSION = 1;
const legacyRoot = path.resolve(
  process.env.OPENWORK_LEGACY_CONFIG_DIR ||
    path.join(os.homedir(), '.craft-agent'),
);
const qwenRoot = path.resolve(
  process.env.QWEN_HOME || path.join(os.homedir(), '.qwen'),
);
const reportPath = path.join(qwenRoot, `openwork-migration-v${VERSION}.json`);

if (process.argv.includes('--rollback')) rollback();
else migrate();

function migrate() {
  const previous = readJson(reportPath, true);
  if (
    previous?.version === VERSION &&
    (previous.migratedAt || previous.rolledBackAt)
  )
    return;

  const createdFiles =
    previous?.version === VERSION && Array.isArray(previous.createdFiles)
      ? previous.createdFiles
      : [];
  const reusedSessions = [];
  const skippedSessions = [];
  const configPath = path.join(legacyRoot, 'config.json');
  const config = readJson(configPath);
  const workspaces = Array.isArray(config?.workspaces) ? config.workspaces : [];

  for (const workspace of workspaces) {
    if (!workspace || typeof workspace !== 'object') continue;
    const workspaceRoot = resolveLegacyPath(workspace.rootPath);
    if (!workspaceRoot) continue;
    const workspaceConfig = readJson(path.join(workspaceRoot, 'config.json'));
    const targetCwd =
      resolveLegacyPath(
        workspaceConfig?.defaults?.workingDirectory,
        workspaceRoot,
      ) || workspaceRoot;
    migrateSessions(
      workspaceRoot,
      targetCwd,
      createdFiles,
      reusedSessions,
      skippedSessions,
    );
    archiveMetadata(
      workspaceRoot,
      String(workspace.id || path.basename(workspaceRoot)),
      createdFiles,
    );
  }

  fs.mkdirSync(qwenRoot, { recursive: true, mode: 0o700 });
  writeAtomic(reportPath, {
    version: VERSION,
    migratedAt: new Date().toISOString(),
    legacyRoot,
    createdFiles,
    reusedSessions,
    skippedSessions,
    retainedCredentials: [
      path.join(legacyRoot, 'credentials.enc'),
      path.join(qwenRoot, 'oauth_creds.json'),
    ],
  });
}

function migrateSessions(
  workspaceRoot,
  targetCwd,
  createdFiles,
  reusedSessions,
  skippedSessions,
) {
  const sessionsDir = path.join(workspaceRoot, 'sessions');
  for (const entry of readDirectory(sessionsDir)) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const legacySession = path.join(sessionsDir, entry.name, 'session.jsonl');
    const header = readFirstJsonLine(legacySession);
    const sessionId =
      typeof header?.sdkSessionId === 'string'
        ? header.sdkSessionId
        : typeof header?.id === 'string'
          ? header.id
          : undefined;
    if (!sessionId || !/^[A-Za-z0-9._-]{1,128}$/.test(sessionId)) {
      skippedSessions.push({ legacySession, reason: 'invalid session id' });
      continue;
    }
    const sourceCwd =
      resolveLegacyPath(header.sdkCwd || header.workingDirectory) || targetCwd;
    const source = sessionPath(sourceCwd, sessionId);
    const destination = sessionPath(targetCwd, sessionId);
    if (source === destination) {
      if (!fs.statSync(source, { throwIfNoEntry: false })?.isFile()) {
        skippedSessions.push({
          sessionId,
          legacySession,
          reason: 'native transcript missing',
        });
        continue;
      }
      reusedSessions.push({ sessionId, path: destination });
      continue;
    }
    if (fs.existsSync(destination)) {
      reusedSessions.push({ sessionId, path: destination });
      continue;
    }
    if (!fs.statSync(source, { throwIfNoEntry: false })?.isFile()) {
      skippedSessions.push({
        sessionId,
        legacySession,
        reason: 'native transcript missing',
      });
      continue;
    }
    const transcript = fs.readFileSync(source, 'utf8');
    let records;
    try {
      records = transcript
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      if (
        records.some(
          (record) =>
            !record || typeof record !== 'object' || Array.isArray(record),
        )
      ) {
        throw new Error('invalid native transcript record');
      }
    } catch {
      skippedSessions.push({
        sessionId,
        legacySession,
        reason: 'invalid native transcript',
      });
      continue;
    }
    for (const record of records) record.cwd = targetCwd;
    const title = typeof header.name === 'string' ? header.name.trim() : '';
    if (
      title &&
      !records.some(
        (record) =>
          record.type === 'system' && record.subtype === 'custom_title',
      )
    ) {
      records.push({
        uuid: crypto.randomUUID(),
        parentUuid: records.at(-1)?.uuid ?? null,
        sessionId,
        timestamp: new Date().toISOString(),
        type: 'system',
        subtype: 'custom_title',
        cwd: targetCwd,
        version: records[0]?.version,
        systemPayload: { customTitle: title, titleSource: 'manual' },
      });
    }
    createFile(
      destination,
      `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
      createdFiles,
    );
  }
}

function archiveMetadata(workspaceRoot, workspaceId, createdFiles) {
  const destination = path.join(
    qwenRoot,
    'openwork-legacy-v1',
    safeName(workspaceId),
  );
  for (const name of [
    'config.json',
    'labels',
    'statuses',
    'sources',
    'automations',
  ]) {
    copyMetadata(
      path.join(workspaceRoot, name),
      path.join(destination, name),
      createdFiles,
    );
  }
}

function copyMetadata(source, destination, createdFiles) {
  const metadata = fs.lstatSync(source, { throwIfNoEntry: false });
  if (!metadata || metadata.isSymbolicLink()) return;
  if (metadata.isDirectory()) {
    for (const entry of readDirectory(source)) {
      if (!entry.isSymbolicLink()) {
        copyMetadata(
          path.join(source, entry.name),
          path.join(destination, entry.name),
          createdFiles,
        );
      }
    }
  } else if (metadata.isFile()) {
    createFile(destination, fs.readFileSync(source), createdFiles);
  }
}

function rollback() {
  const report = readJson(reportPath, true);
  if (report?.version !== VERSION || report.rolledBackAt) return;
  for (const created of Array.isArray(report.createdFiles)
    ? report.createdFiles
    : []) {
    const file = path.resolve(qwenRoot, created.path || '');
    if (
      file.startsWith(`${qwenRoot}${path.sep}`) &&
      isContainedFile(file, qwenRoot) &&
      sha256(fs.readFileSync(file)) === created.sha256
    ) {
      fs.rmSync(file);
    }
  }
  writeAtomic(reportPath, {
    ...report,
    rolledBackAt: new Date().toISOString(),
  });
}

function createFile(destination, contents, createdFiles) {
  if (fs.existsSync(destination)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  const created = {
    path: path.relative(qwenRoot, destination),
    sha256: sha256(contents),
  };
  const previous = createdFiles.findIndex(
    (entry) => entry?.path === created.path,
  );
  if (previous === -1) createdFiles.push(created);
  else createdFiles[previous] = created;
  writeAtomic(reportPath, { version: VERSION, legacyRoot, createdFiles });
  fs.writeFileSync(destination, contents, { flag: 'wx', mode: 0o600 });
}

function writeAtomic(destination, value) {
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temporary, destination);
}

function sessionPath(cwd, sessionId) {
  return path.join(
    qwenRoot,
    'projects',
    sanitizeCwd(cwd),
    'chats',
    `${sessionId}.jsonl`,
  );
}

function sanitizeCwd(cwd) {
  const normalized = process.platform === 'win32' ? cwd.toLowerCase() : cwd;
  return normalized.replace(/[^a-zA-Z0-9]/g, '-');
}

function resolveLegacyPath(value, base = legacyRoot) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const expanded = value
    .replace(/^~(?=$|[\\/])/, os.homedir())
    .replace(/\$\{HOME\}/g, os.homedir());
  return path.resolve(base, expanded);
}

function readJson(file, strict = false) {
  let contents;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    if (strict) throw error;
    return undefined;
  }
}

function readFirstJsonLine(file) {
  let contents;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (!isMissing(error)) throw error;
    return undefined;
  }
  try {
    return JSON.parse(contents.split(/\r?\n/, 1)[0]);
  } catch {
    return undefined;
  }
}

function readDirectory(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

function isMissing(error) {
  return error?.code === 'ENOENT';
}

function safeName(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128) || 'workspace';
}

function isContainedFile(file, root) {
  try {
    const boundary = `${fs.realpathSync(root)}${path.sep}`;
    return (
      fs.lstatSync(file).isFile() && fs.realpathSync(file).startsWith(boundary)
    );
  } catch {
    return false;
  }
}

function sha256(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex');
}
