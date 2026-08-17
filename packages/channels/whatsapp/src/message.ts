export function bareJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const at = jid.indexOf('@');
  if (at < 0) return jid;
  return jid.slice(0, at).split(':')[0] + jid.slice(at);
}

export function extractText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const data = message as Record<string, unknown>;
  if (typeof data['conversation'] === 'string') return data['conversation'];
  for (const key of [
    'extendedTextMessage',
    'imageMessage',
    'videoMessage',
    'documentMessage',
  ]) {
    const value = data[key];
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    const text = record['text'] ?? record['caption'];
    if (typeof text === 'string') return text;
  }
  return '';
}

export function acceptInbound({
  id,
  remoteJid,
  fromMe,
  text,
  selfChatMode,
  selfJid,
  selfLid,
  responsePrefix,
  sentIds,
}: {
  id?: string | null;
  remoteJid?: string | null;
  fromMe?: boolean | null;
  text: string;
  selfChatMode: boolean;
  selfJid: string | null;
  selfLid: string | null;
  responsePrefix: string;
  sentIds: ReadonlySet<string>;
}): boolean {
  if (!id || !remoteJid || !text) return false;
  if (!fromMe) return !selfChatMode;
  const remote = bareJid(remoteJid);
  const selfChat = remote === selfJid || remote === selfLid;
  return (
    selfChatMode &&
    selfChat &&
    !sentIds.has(id) &&
    !text.startsWith(responsePrefix)
  );
}

export function rememberSentId(sentIds: Set<string>, id: string): void {
  sentIds.add(id);
  if (sentIds.size > 500) {
    const oldest = sentIds.values().next().value;
    if (oldest) sentIds.delete(oldest);
  }
}
