import { notifyOpenWorkClientStateChanged } from './preferences';

const STORAGE_KEY = 'openwork-command-palette-recents';
const MAX_RECENTS = 6;

export function pushRecentCommand(
  commands: readonly string[],
  id: string,
): string[] {
  return [id, ...commands.filter((command) => command !== id)].slice(
    0,
    MAX_RECENTS,
  );
}

export function readRecentCommands(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    const commands: string[] = [];
    for (const entry of value) {
      if (typeof entry === 'string' && entry && !commands.includes(entry)) {
        commands.push(entry);
      }
      if (commands.length === MAX_RECENTS) break;
    }
    return commands;
  } catch {
    return [];
  }
}

export function replaceRecentCommands(commands: readonly string[]): void {
  const next = commands
    .filter(
      (command, index) =>
        Boolean(command) && commands.indexOf(command) === index,
    )
    .slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Command history is convenience-only.
  }
  notifyOpenWorkClientStateChanged();
}

export function recordRecentCommand(id: string): void {
  replaceRecentCommands(pushRecentCommand(readRecentCommands(), id));
}
