import express from 'express';
import { config } from './config.js';
import { parseUpdate, sendMessage, sendTyping } from './telegram.js';
import { processMessage } from './claude.js';
import { listTools } from './mcp.js';

const app = express();
app.use(express.json());

// ── Telegram webhook ─────────────────────────────────────────────────────────

app.post('/webhook', (req, res) => {
  // Validate the secret token Telegram sends in the header
  if (config.webhookSecret) {
    const token = req.headers['x-telegram-bot-api-secret-token'];
    if (token !== config.webhookSecret) {
      return res.sendStatus(403);
    }
  }

  // Acknowledge immediately so Telegram doesn't retry
  res.sendStatus(200);

  // Process asynchronously — do not await here
  handleUpdate(req.body);
});

async function handleUpdate(body) {
  const update = parseUpdate(body);
  if (!update) return;

  const { chatId, text, from } = update;
  console.log(`[${from}] ${text}`);

  try {
    await sendMessage(chatId, `Got your message, working on it... (your ID: ${chatId})`);
    await sendTyping(chatId);
    const reply = await processMessage(text, chatId);
    if (reply) await sendMessage(chatId, reply);
  } catch (err) {
    console.error('Error handling update:', err);
    await sendMessage(chatId, 'Sorry, something went wrong.').catch(() => { });
  }
}

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
