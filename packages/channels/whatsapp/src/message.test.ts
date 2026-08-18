import { describe, expect, it } from 'vitest';
import { acceptInbound, extractText } from './message.js';

describe('WhatsApp message filtering', () => {
  it('accepts contact mode and self-chat mode without echoing bot replies', () => {
    const base = {
      id: 'message-1',
      remoteJid: '15551234567@s.whatsapp.net',
      text: 'hello',
      selfJid: '15551234567@s.whatsapp.net',
      selfLid: null,
      responsePrefix: '🤖',
      sentIds: new Set<string>(),
    };
    expect(acceptInbound({ ...base, fromMe: false, selfChatMode: false })).toBe(
      true,
    );
    expect(acceptInbound({ ...base, fromMe: false, selfChatMode: true })).toBe(
      false,
    );
    expect(acceptInbound({ ...base, fromMe: true, selfChatMode: true })).toBe(
      true,
    );
    expect(
      acceptInbound({
        ...base,
        fromMe: true,
        selfChatMode: true,
        text: '🤖 response',
      }),
    ).toBe(false);
    expect(extractText({ imageMessage: { caption: 'caption' } })).toBe(
      'caption',
    );
  });
});
