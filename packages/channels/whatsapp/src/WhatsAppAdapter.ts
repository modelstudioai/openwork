import { chmod, mkdir, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState as loadMultiFileAuthState,
} from '@whiskeysockets/baileys';
import type {
  AuthenticationState,
  SignalDataSet,
} from '@whiskeysockets/baileys';
import { ChannelBase } from '@qwen-code/channel-base';
import type {
  ChannelAgentBridge,
  ChannelBaseOptions,
  ChannelConfig,
  Envelope,
} from '@qwen-code/channel-base';
import {
  acceptInbound,
  bareJid,
  extractText,
  rememberSentId,
} from './message.js';

const silentLogger = {
  level: 'silent',
  fatal: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  child: () => silentLogger,
};

type WhatsAppSocket = ReturnType<typeof makeWASocket>;

async function secureAuthFiles(directory: string): Promise<void> {
  await chmod(directory, 0o700);
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) => {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) return secureAuthFiles(file);
      return entry.isFile() ? chmod(file, 0o600) : undefined;
    }),
  );
}

export class WhatsAppChannel extends ChannelBase {
  private socket: WhatsAppSocket | null = null;
  private stopped = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connected = false;
  private hasConnected = false;
  private rejectConnect: ((error: Error) => void) | null = null;
  private readonly sentIds = new Set<string>();
  private readonly phoneNumber: string;
  private readonly selfChatMode: boolean;
  private readonly responsePrefix: string;

  constructor(
    name: string,
    config: ChannelConfig,
    bridge: ChannelAgentBridge,
    options?: ChannelBaseOptions,
  ) {
    super(name, config, bridge, options);
    const values = config as ChannelConfig & {
      phoneNumber?: string;
      selfChatMode?: boolean;
      responsePrefix?: string;
    };
    this.phoneNumber = values.phoneNumber?.replace(/\D/g, '') ?? '';
    this.selfChatMode = values.selfChatMode === true;
    this.responsePrefix = values.responsePrefix?.trim() || '🤖';
  }

  async connect(): Promise<void> {
    this.stopped = false;
    this.hasConnected = false;
    const authDir =
      this.stateDir ??
      join(homedir(), '.qwen', 'channels', this.name, 'whatsapp');
    await mkdir(authDir, { recursive: true, mode: 0o700 });
    await secureAuthFiles(authDir);
    const { state, saveCreds } = await loadMultiFileAuthState(authDir);
    const secureState: AuthenticationState = {
      creds: state.creds,
      keys: {
        get: state.keys.get.bind(state.keys),
        set: async (data: SignalDataSet) => {
          await state.keys.set(data);
          await secureAuthFiles(authDir);
        },
      },
    };
    const saveSecureCreds = async () => {
      await saveCreds();
      await secureAuthFiles(authDir);
    };

    return new Promise<void>((resolve, reject) => {
      this.rejectConnect = reject;
      const connected = () => {
        if (!this.rejectConnect) return;
        this.rejectConnect = null;
        resolve();
      };
      const failed = (error: Error) => {
        if (this.rejectConnect) {
          this.rejectConnect = null;
          reject(error);
        } else if (this.hasConnected) {
          this.onTerminalDisconnect?.(error);
        }
      };
      const boot = () => {
        if (this.stopped) return;
        const socket = makeWASocket({
          auth: secureState,
          browser: Browsers.macOS('OpenWork'),
          logger: silentLogger,
          printQRInTerminal: false,
        });
        this.socket = socket;
        socket.ev.on('creds.update', () => {
          void saveSecureCreds().catch((error) => {
            process.stderr.write(
              `[WhatsApp:${this.name}] Failed to secure credentials: ${error instanceof Error ? error.message : String(error)}\n`,
            );
            socket.end(
              error instanceof Error ? error : new Error(String(error)),
            );
          });
        });
        socket.ev.on('connection.update', ({ connection, lastDisconnect }) => {
          if (connection === 'open') {
            this.connected = true;
            this.hasConnected = true;
            this.reconnectAttempts = 0;
            connected();
            process.stderr.write(
              `[WhatsApp:${this.name}] Connected as ${socket.user?.id ?? 'unknown'}\n`,
            );
            return;
          }
          if (connection !== 'close' || this.stopped) return;
          this.connected = false;
          if (this.socket === socket) this.socket = null;
          const statusCode = (
            lastDisconnect?.error as
              | { output?: { statusCode?: number } }
              | undefined
          )?.output?.statusCode;
          if (statusCode === DisconnectReason.loggedOut) {
            const error = new Error(
              'WhatsApp logged out; reconfigure the channel to pair again.',
            );
            process.stderr.write(`[WhatsApp:${this.name}] ${error.message}\n`);
            void rm(authDir, { recursive: true, force: true })
              .catch((cleanupError) => {
                process.stderr.write(
                  `[WhatsApp:${this.name}] Failed to clear logged-out credentials: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}\n`,
                );
              })
              .finally(() => failed(error));
            return;
          }
          this.reconnectAttempts += 1;
          if (this.reconnectAttempts > 10) {
            failed(new Error('WhatsApp could not establish a connection.'));
            return;
          }
          if (this.reconnectTimer) return;
          this.reconnectTimer = setTimeout(
            () => {
              this.reconnectTimer = null;
              boot();
            },
            Math.min(30_000, 1000 * 2 ** (this.reconnectAttempts - 1)),
          );
        });
        socket.ev.on('messages.upsert', ({ messages, type }) => {
          if (type !== 'notify') return;
          const selfJid = bareJid(socket.user?.id);
          const selfLid = bareJid(socket.user?.lid);
          for (const message of messages) {
            const text = extractText(message.message);
            const key = message.key;
            if (
              !acceptInbound({
                id: key.id,
                remoteJid: key.remoteJid,
                fromMe: key.fromMe,
                text,
                selfChatMode: this.selfChatMode,
                selfJid,
                selfLid,
                responsePrefix: this.responsePrefix,
                sentIds: this.sentIds,
              })
            ) {
              continue;
            }
            const chatId = key.remoteJid!;
            const senderId = key.participant ?? chatId;
            const mentioned =
              message.message?.extendedTextMessage?.contextInfo?.mentionedJid ??
              [];
            const envelope: Envelope = {
              channelName: this.name,
              senderId,
              senderName: message.pushName ?? senderId,
              chatId,
              text,
              isGroup: chatId.endsWith('@g.us'),
              isMentioned: mentioned.some((jid) => {
                const mention = bareJid(jid);
                return mention === selfJid || mention === selfLid;
              }),
              isReplyToBot: false,
            };
            void this.handleInbound(envelope).catch((error) => {
              process.stderr.write(
                `[WhatsApp:${this.name}] Failed to handle message: ${error instanceof Error ? error.message : String(error)}\n`,
              );
            });
          }
        });
        if (!state.creds.registered) {
          if (!this.phoneNumber) {
            const error = new Error(
              'WhatsApp phoneNumber is required for initial pairing.',
            );
            failed(error);
            socket.end(error);
            return;
          }
          void socket
            .requestPairingCode(this.phoneNumber)
            .then((code) =>
              process.stderr.write(
                `[WhatsApp:${this.name}] Pairing code: ${code}\n`,
              ),
            )
            .catch((error) => {
              const failure =
                error instanceof Error ? error : new Error(String(error));
              failed(failure);
              process.stderr.write(
                `[WhatsApp:${this.name}] Pairing failed: ${failure.message}\n`,
              );
              socket.end(failure);
            });
        }
      };

      boot();
    });
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.socket || !this.connected) {
      throw new Error('WhatsApp is not connected');
    }
    const self = bareJid(this.socket.user?.id);
    const output =
      this.selfChatMode && bareJid(chatId) === self
        ? `${this.responsePrefix} ${text}`
        : text;
    const sent = await this.socket.sendMessage(chatId, { text: output });
    if (sent?.key.id) rememberSentId(this.sentIds, sent.key.id);
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    this.connected = false;
    this.rejectConnect?.(new Error('WhatsApp connection stopped.'));
    this.rejectConnect = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.end(undefined);
    this.socket = null;
  }
}
