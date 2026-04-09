# Telegram Bot Setup

## 1. Create a Bot & Get the Token

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Follow the prompts:
   - Choose a display name (e.g. `My Task Bot`)
   - Choose a username — must end in `bot` (e.g. `my_task_bot`)
4. BotFather replies with your token:
   ```
   Use this token to access the HTTP API:
   7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
5. Copy that token into your `.env`:
   ```
   TELEGRAM_BOT_TOKEN=7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

---

## 2. Generate a Webhook Secret

This is a string **you create yourself** — Telegram doesn't issue it. It's used to verify that incoming webhook requests actually come from Telegram.

Generate a strong random value:

```bash
openssl rand -hex 32
```

Copy the output into your `.env`:

```
WEBHOOK_SECRET=the-value-you-just-generated
```

**Rules:** only A–Z, a–z, 0–9, `_`, and `-` are allowed. Max 256 characters.

---

## 3. Register the Webhook with Telegram

Once your server is publicly reachable (via ngrok, Cloudflare Tunnel, a VPS, etc.), register the webhook:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/webhook",
    "secret_token": "<WEBHOOK_SECRET>"
  }'
```

A successful response looks like:
```json
{ "ok": true, "result": true, "description": "Webhook was set" }
```

---

## 4. Verify It's Working

Check webhook status:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

Look for `"url"` set to your endpoint and `"last_error_message"` being absent.

Then send your bot a message on Telegram — it should respond.

---

## Local Development (ngrok)

Telegram requires a public HTTPS URL. For local testing:

```bash
# Install ngrok from https://ngrok.com, then:
ngrok http 3000
```

Use the `https://xxxx.ngrok-free.app` URL as your webhook URL, then re-run the `setWebhook` curl above.
