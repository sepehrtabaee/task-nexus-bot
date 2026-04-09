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

async function handleUpdate(body) {
  const update = parseUpdate(body);
  if (!update) return;

  const { chatId, text, from } = update;
  console.log(`[${from}] ${text}`);

  try {
    await sendMessage(chatId, `Got your message, working on it`);
    await sendTyping(chatId);
    const reply = await processMessage(text, chatId);
    if (reply) await sendMessage(chatId, reply);
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
