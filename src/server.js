import 'dotenv/config';
import express from 'express';
import { config } from './config.js';
import { parseUpdate, sendMessage, sendTyping } from './telegram.js';
import { processMessage } from './claude.js';

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
    await sendTyping(chatId);
    const reply = await processMessage(text);
    if (reply) await sendMessage(chatId, reply);
  } catch (err) {
    console.error('Error handling update:', err);
    await sendMessage(chatId, 'Sorry, something went wrong.').catch(() => {});
  }
}

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
  console.log(`Webhook endpoint: POST /webhook`);
  console.log(`\nTo register webhook with Telegram, run:`);
  console.log(`  curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook -d '{"url":"https://<your-domain>/webhook"}'`);
});
