import express from 'express';
import { config } from './config.js';
import { parseUpdate, sendMessage, sendTyping, downloadFile } from './telegram.js';
import { processMessage } from './llm/agent.js';
import { transcribeAudio } from './transcribe.js';
import { listTools } from './mcp.js';

console.log(`LLM provider: ${config.llmProvider}`);

const app = express();
app.use(express.json());

// ── Telegram webhook ─────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  // Validate the secret token Telegram sends in the header
  if (config.webhookSecret) {
    const token = req.headers['x-telegram-bot-api-secret-token'];
    if (token !== config.webhookSecret) {
      return res.sendStatus(403);
    }
  }

  // Process fully before responding — on serverless, the function is killed after res is sent
  await handleUpdate(req.body);
  res.sendStatus(200);
});

const apiHeaders = () => ({ 'Authorization': `Bearer ${config.apiToken}` });

async function getUserByTelegramId(chatId) {
  const res = await fetch(`${config.apiUrl}/users/telegram/${chatId}`, {
    headers: apiHeaders(),
  });

  if (!res.ok) throw new Error(`You do not have access to this bot.`);
  return res.json();
}


async function getMessageHistory(userId) {
  const res = await fetch(`${config.apiUrl}/messages/user/${userId}`, {
    headers: apiHeaders(),
  });
  if (!res.ok) {
    console.warn(`Failed to fetch message history for userId ${userId}: ${res.status}`);
    return [];
  }
  return res.json();
}

async function saveMessage(userId, role, content) {
  const res = await fetch(`${config.apiUrl}/messages`, {
    method: 'POST',
    headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, role, content }),
  });
  if (!res.ok) console.warn(`Failed to save ${role} message for userId ${userId}: ${res.status}`);
}

async function resolveText(update) {
  if (update.type === 'text') return update.text;

  if (update.type === 'voice') {
    const { buffer, filename } = await downloadFile(update.fileId);
    const transcript = await transcribeAudio(buffer, filename, update.mimeType);
    if (!transcript?.trim()) throw new Error("Couldn't transcribe that voice message — try again?");
    return transcript;
  }

  return null;
}

async function handleUpdate(body) {
  const update = parseUpdate(body);
  if (!update) return;

  const { chatId } = update;

  try {
    const user = await getUserByTelegramId(chatId);
    const userId = user.id;

    await sendTyping(chatId);

    const text = await resolveText(update);
    if (!text) return;

    await saveMessage(userId, 'user', text);

    const history = await getMessageHistory(userId);
    const reply = await processMessage(text, userId, chatId, history);
    if (reply) {
      await sendMessage(chatId, reply);
      await saveMessage(userId, 'assistant', reply);
    }
  } catch (err) {
    console.error('Error handling update:', err);
    await sendMessage(chatId, `${err}`).catch(() => { });
  }
}

// ── Direct chat (bypass Telegram webhook, for debugging) ─────────────────────
// POST /chat { text, telegramId, history? }
// Optional: same x-telegram-bot-api-secret-token header check as /webhook.
app.post('/chat', async (req, res) => {
  if (config.telegramToken) {
    const token = req.headers['x-telegram-bot-api-secret-token'];
    if (token !== config.telegramToken) return res.sendStatus(403);
  }

  const { text, telegramId, history } = req.body ?? {};
  if (!text || !telegramId) {
    return res.status(400).json({ error: 'text and telegramId are required' });
  }

  try {
    const user = await getUserByTelegramId(telegramId);
    const reply = await processMessage(text, user.id, telegramId, history ?? []);
    res.json({ reply });
  } catch (err) {
    console.error('Error in /chat:', err);
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }));


// ── Local dev only ────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'production') {
  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  });
}

export default app;
