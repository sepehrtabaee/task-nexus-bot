import express from 'express';
import { config } from './config.js';
import { parseUpdate, sendMessage, sendTyping } from './telegram.js';
import { processMessage } from './claude.js';
import { listTools } from './mcp.js';

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

async function getUserByTelegramId(chatId) {
  const res = await fetch(`${config.apiUrl}/users/telegram/${chatId}`);
  if (!res.ok) throw new Error(`Failed to fetch user for chatId ${chatId}: ${res.status}`);
  return res.json();
}

async function getMessageHistory(userId) {
  const res = await fetch(`${config.apiUrl}/messages/user/${userId}`);
  if (!res.ok) {
    console.warn(`Failed to fetch message history for userId ${userId}: ${res.status}`);
    return [];
  }
  return res.json();
}

async function saveMessage(userId, role, content) {
  const res = await fetch(`${config.apiUrl}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, role, content }),
  });
  if (!res.ok) console.warn(`Failed to save ${role} message for userId ${userId}: ${res.status}`);
}

async function handleUpdate(body) {
  const update = parseUpdate(body);
  if (!update) return;

  const { chatId, text, from } = update;
  console.log(`[${from}] ${text}`);

  try {
    await sendMessage(chatId, `Got your message, working on it`);
    await sendTyping(chatId);

    const user = await getUserByTelegramId(chatId);
    const userId = user.id;

    const history = await getMessageHistory(userId);
    const reply = await processMessage(text, userId, chatId, history);
    if (reply) {
      await sendMessage(chatId, reply);
      await Promise.all([
        saveMessage(userId, 'user', text),
        saveMessage(userId, 'assistant', reply),
      ]);
    }
  } catch (err) {
    console.error('Error handling update:', err);
    await sendMessage(chatId, `Sorry, something went wrong. ${err}`).catch(() => { });
  }
}

// ── Test endpoint (Postman) ───────────────────────────────────────────────────

app.post('/test', async (req, res) => {
  const { chatId, text } = req.body;
  if (!chatId || !text) {
    return res.status(400).json({ error: 'chatId and text are required' });
  }

  res.json({ status: 'processing' });
  handleUpdate({ message: { chat: { id: chatId }, from: { id: chatId }, text } });
});

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── MCP tools ────────────────────────────────────────────────────────────────

app.get('/tools', async (_req, res) => {
  try {
    const tools = await listTools();
    res.json({ tools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Local dev only ────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'production') {
  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  });
}

export default app;
