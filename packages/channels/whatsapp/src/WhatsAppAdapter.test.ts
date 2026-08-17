import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ChannelAgentBridge,
  ChannelConfig,
} from '@qwen-code/channel-base';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EventHandler = (event: unknown) => void;

const baileys = vi.hoisted(() => ({
  handlers: new Map<string, EventHandler>(),
  makeSocket: vi.fn(),
  end: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('@whiskeysockets/baileys', () => ({
  default: baileys.makeSocket,
  Browsers: { macOS: () => ['OpenWork', 'Desktop', '1'] },
  DisconnectReason: { loggedOut: 401 },
  useMultiFileAuthState: vi.fn(async () => ({
    state: {
      creds: { registered: true },
      keys: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
    },
    saveCreds: vi.fn(async () => undefined),
  })),
}));

import { WhatsAppChannel } from './WhatsAppAdapter.js';

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), 'openwork-whatsapp-test-'));
  baileys.handlers.clear();
  baileys.end.mockReset();
  baileys.sendMessage.mockReset().mockResolvedValue({ key: { id: 'sent' } });
  baileys.makeSocket.mockReset().mockImplementation(() => ({
    ev: {
      on: (event: string, handler: EventHandler) =>
        baileys.handlers.set(event, handler),
    },
    user: { id: '15551234567@s.whatsapp.net' },
    end: baileys.end,
    sendMessage: baileys.sendMessage,
    requestPairingCode: vi.fn(),
  }));
});

afterEach(async () => {
  await rm(stateDir, { recursive: true, force: true });
});

function channel(
  onTerminalDisconnect?: (error: Error) => void,
): WhatsAppChannel {
  const config = {
    type: 'whatsapp',
    phoneNumber: '15551234567',
    senderPolicy: 'open',
    allowedUsers: [],
    sessionScope: 'chat_thread',
    cwd: stateDir,
    groupPolicy: 'open',
    dmPolicy: 'open',
    groups: { '*': {} },
  } as unknown as ChannelConfig;
  const bridge = {
    newSession: vi.fn(),
    loadSession: vi.fn(),
    prompt: vi.fn(),
    cancelSession: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  } as unknown as ChannelAgentBridge;
  return new WhatsAppChannel('test', config, bridge, {
    stateDir,
    onTerminalDisconnect,
  });
}

describe('WhatsApp connection lifecycle', () => {
  it('does not report ready or send until the socket is open', async () => {
    const adapter = channel();
    let ready = false;
    const connecting = adapter.connect().then(() => {
      ready = true;
    });

    await vi.waitFor(() => expect(baileys.makeSocket).toHaveBeenCalledOnce());
    expect(ready).toBe(false);
    await expect(adapter.sendMessage('chat', 'hello')).rejects.toThrow(
      'not connected',
    );

    baileys.handlers.get('connection.update')?.({ connection: 'open' });
    await connecting;
    await adapter.sendMessage('chat', 'hello');
    expect(baileys.sendMessage).toHaveBeenCalledWith('chat', { text: 'hello' });
    await adapter.disconnect();
  });

  it.skipIf(process.platform === 'win32')(
    'locks down existing authentication state',
    async () => {
      const nested = join(stateDir, 'keys');
      const credentials = join(nested, 'creds.json');
      await mkdir(nested);
      await writeFile(credentials, '{}');
      await chmod(stateDir, 0o755);
      await chmod(nested, 0o755);
      await chmod(credentials, 0o644);

      const adapter = channel();
      const connecting = adapter.connect();
      await vi.waitFor(() => expect(baileys.makeSocket).toHaveBeenCalledOnce());
      baileys.handlers.get('connection.update')?.({ connection: 'open' });
      await connecting;

      expect((await stat(stateDir)).mode & 0o777).toBe(0o700);
      expect((await stat(nested)).mode & 0o777).toBe(0o700);
      expect((await stat(credentials)).mode & 0o777).toBe(0o600);
      await adapter.disconnect();
    },
  );

  it('reports a permanent disconnect after becoming ready', async () => {
    const onTerminalDisconnect = vi.fn();
    const adapter = channel(onTerminalDisconnect);
    const connecting = adapter.connect();
    await vi.waitFor(() => expect(baileys.makeSocket).toHaveBeenCalledOnce());
    baileys.handlers.get('connection.update')?.({ connection: 'open' });
    await connecting;

    baileys.handlers.get('connection.update')?.({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    });

    await vi.waitFor(() => expect(onTerminalDisconnect).toHaveBeenCalledOnce());
    expect(onTerminalDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('logged out'),
      }),
    );
    await vi.waitFor(async () => {
      await expect(stat(stateDir)).rejects.toMatchObject({ code: 'ENOENT' });
    });
    await adapter.disconnect();
  });

  it('does not report an initial connection failure as a later disconnect', async () => {
    const onTerminalDisconnect = vi.fn();
    const adapter = channel(onTerminalDisconnect);
    const connecting = adapter.connect();
    await vi.waitFor(() => expect(baileys.makeSocket).toHaveBeenCalledOnce());

    baileys.handlers.get('connection.update')?.({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    });

    await expect(connecting).rejects.toThrow('logged out');
    await expect(stat(stateDir)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(onTerminalDisconnect).not.toHaveBeenCalled();
    await adapter.disconnect();
  });
});
