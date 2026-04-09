import { config } from './config.js';

const BASE = `https://api.telegram.org/bot${config.telegramToken}`;

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
  return apiCall('sendMessage', { chat_id: chatId, text });
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

// Extracts the fields we care about from a Telegram Update object
export function parseUpdate(body) {
  const msg = body?.message;
  if (!msg?.text) return null;

  return {
    chatId: msg.chat.id,
    text: msg.text,
    from: msg.from?.username ?? msg.from?.first_name ?? 'unknown',
  };
}
