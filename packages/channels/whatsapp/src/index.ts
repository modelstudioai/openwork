import type { ChannelPlugin } from '@qwen-code/channel-base';
import { WhatsAppChannel } from './WhatsAppAdapter.js';

export { WhatsAppChannel };

export const plugin: ChannelPlugin = {
  channelType: 'whatsapp',
  displayName: 'WhatsApp (unofficial)',
  defaultSessionScope: 'chat_thread',
  management: {
    fields: [
      {
        key: 'phoneNumber',
        label: 'Phone Number',
        kind: 'string',
        required: true,
        description:
          'Digits including country code. The pairing code is printed in daemon logs.',
      },
      {
        key: 'selfChatMode',
        label: 'Self-chat mode',
        kind: 'boolean',
        description: 'Only accept messages sent to your own WhatsApp chat.',
      },
      {
        key: 'responsePrefix',
        label: 'Response prefix',
        kind: 'string',
        default: '🤖',
        description: 'Marks agent replies and prevents self-chat echo loops.',
      },
    ],
    validateConfig: (config) =>
      /^\d{7,15}$/.test(String(config['phoneNumber'] ?? '').replace(/\D/g, ''))
        ? undefined
        : 'Phone number must contain 7–15 digits including country code.',
  },
  createChannel: (name, config, bridge, options) =>
    new WhatsAppChannel(name, config, bridge, options),
};
