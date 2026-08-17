export { TelegramChannel } from './TelegramAdapter.js';

import { TelegramChannel } from './TelegramAdapter.js';
import type { ChannelPlugin } from '@qwen-code/channel-base';

export const plugin: ChannelPlugin = {
  channelType: 'telegram',
  displayName: 'Telegram',
  requiredConfigFields: ['token'],
  management: {
    fields: [
      {
        key: 'token',
        label: 'Bot Token',
        kind: 'secret',
        required: true,
        envResolvable: true,
        description: 'Token issued by @BotFather',
      },
    ],
  },
  createChannel: (name, config, bridge, options) =>
    new TelegramChannel(name, config, bridge, options),
};
