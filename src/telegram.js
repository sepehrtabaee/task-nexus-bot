import { Buffer } from 'node:buffer';
import { config } from './config.js';

const BASE = `https://api.telegram.org/bot${config.telegramToken}`;
const FILE_BASE = `https://api.telegram.org/file/bot${config.telegramToken}`;

async function apiCall(method, body) {
  const res = await fetch(`${BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram [${method}] error: ${data.description}`);
  return data.result;
}

export function sendMessage(chatId, text) {
  return apiCall('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
}

export function sendTyping(chatId) {
  return apiCall('sendChatAction', { chat_id: chatId, action: 'typing' });
}

export function setWebhook(url) {
  return apiCall('setWebhook', {
    url,
    ...(config.webhookSecret && { secret_token: config.webhookSecret }),
  });
}

// Downloads a Telegram file by file_id and returns { buffer, mimeType, filename }.
export async function downloadFile(fileId) {
  const file = await apiCall('getFile', { file_id: fileId });
  const res = await fetch(`${FILE_BASE}/${file.file_path}`);
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, filename: file.file_path.split('/').pop() };
}

// Extracts the fields we care about from a Telegram Update object.
// Returns text messages or voice/audio messages (with file_id for download).
export function parseUpdate(body) {
  const msg = body?.message;
  if (!msg) return null;

  const base = {
    chatId: msg.chat.id,
    from: msg.from?.username ?? msg.from?.first_name ?? 'unknown',
  };

  if (msg.text) return { ...base, type: 'text', text: msg.text };
  if (msg.voice) return { ...base, type: 'voice', fileId: msg.voice.file_id, mimeType: msg.voice.mime_type };
  if (msg.audio) return { ...base, type: 'voice', fileId: msg.audio.file_id, mimeType: msg.audio.mime_type };

  return null;
}
