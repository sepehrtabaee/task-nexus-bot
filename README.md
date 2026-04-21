# TaskNexus — Telegram Bot

> **Part of a larger project.** The full system overview, architecture, and setup guide lives in the [main TaskNexus Core repository](https://github.com/sepehrtabaee/task-nexus-core).
>
> Related repositories:
> - [task-nexus-core](https://github.com/sepehrtabaee/task-nexus-core) — Backend API & MCP server
> - [task-nexus-dash](https://github.com/sepehrtabaee/task-nexus-dash) — Web dashboard

---

## Role in the Ecosystem

This is the **mobile entry-point for TaskNexus** — a Telegram bot that lets you manage your tasks through natural conversation. Instead of opening a dashboard, you can add tasks, check what's due today, and mark things done directly from any Telegram client.

---

## Key Features

- **Natural language task adding** — tell the bot what to do in plain English; the chosen LLM interprets it and creates the task via the MCP backend.
- **Pluggable LLM provider** — runs on either Anthropic (Claude) or OpenAI (GPT), selectable via the `LLM_PROVIDER` env var.
- **Voice message support** — send a voice note and the bot transcribes it via OpenAI's `gpt-4o-mini-transcribe`, then handles it like any other message.
- **Quick-view today's list** — ask "what's on my list?" and get a summary in chat.
- **Full agentic loop** — the bot uses MCP tool-calling to read, create, update, and delete tasks on your behalf.
- **Persistent conversation history** — message context is stored per-user so follow-up requests work naturally.
- **Serverless-ready** — deployed on Vercel; the Express server doubles as a serverless function handler.

---

## Architecture

```
Telegram  →  /webhook (Express)  →  [Whisper transcription if voice]  →  LLM (Claude or GPT)  →  MCP Server  →  TaskNexus API
```

The bot receives Telegram updates via a webhook. Voice messages are downloaded from Telegram and transcribed via OpenAI's `gpt-4o-mini-transcribe` before entering the agent loop. The LLM layer is pluggable:

- **Anthropic** (default) — [src/claude.js](src/claude.js) uses `claude-sonnet-4-6` with Anthropic's native MCP tool schema.
- **OpenAI** — [src/gpt.js](src/gpt.js) uses `gpt-5-mini` via the Chat Completions API, with MCP tools adapted to OpenAI's `function` schema.

The active provider is chosen at startup in [src/server.js](src/server.js) based on `LLM_PROVIDER`. Both paths run the same agentic tool-calling loop and hit the same MCP server.

---

## Bot Setup Guide

### 1. Create a bot via BotFather

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot` and follow the prompts to choose a name and username.
3. Copy the **bot token** you receive — this becomes `TELEGRAM_BOT_TOKEN`.

### 2. Register the Webhook

Once your server is deployed (e.g. to Vercel), register the webhook with Telegram by calling:

```
POST https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
{
  "url": "https://<your-deployment-url>/webhook",
  "secret_token": "<WEBHOOK_SECRET>"
}
```

The bot calls `setWebhook` automatically on startup if you invoke `setWebhook()` from `src/telegram.js`. The `secret_token` is optional but strongly recommended — it is validated on every incoming request.

### 3. Environment Variables

Create a `.env` file (or set these in your Vercel project settings):

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from BotFather |
| `LLM_PROVIDER` | Which LLM to use: `anthropic` (default) or `openai` |
| `ANTHROPIC_API_KEY` | Anthropic API key — required for the Claude agent loop |
| `OPENAI_API_KEY` | OpenAI API key — required for voice transcription, and for the GPT agent loop when `LLM_PROVIDER=openai` |
| `WEBHOOK_SECRET` | Random secret for webhook validation (recommended) |
| `MCP_URL` | URL of your TaskNexus MCP server |
| `MCP_TOKEN` | Bearer token for the MCP server |
| `API_URL` | URL of your TaskNexus REST API |
| `API_TOKEN` | Bearer token for the TaskNexus REST API |
| `PORT` | Local dev port (default: `3000`) |

> Both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are validated at startup regardless of `LLM_PROVIDER`: OpenAI is always used for voice transcription, and Anthropic is kept wired in so you can flip providers without redeploying with new secrets.

### 4. Run Locally

```bash
npm install
npm run dev
```

Use a tunnel (e.g. `ngrok`) to expose your local server and point the Telegram webhook at it during development.

---

## Command List

The bot is conversational — there are no rigid slash commands. Just talk to it naturally, either by typing or by sending a voice message. Examples:

| What you type | What happens |
|---|---|
| `Add a task to review the PR by Friday` | Creates a new task with the given description and due date |
| `What's on my list today?` | Returns tasks due today |
| `Mark "review the PR" as done` | Updates the task status to complete |
| `Delete the task about the PR` | Removes the task |
| `Show all my open tasks` | Lists all incomplete tasks |

---

## Security

Access is restricted at two layers:

1. **Webhook secret token** — every incoming Telegram request must include the `X-Telegram-Bot-Api-Secret-Token` header matching `WEBHOOK_SECRET`. Requests without the correct token receive a `403` immediately.

2. **User ID filtering via the API** — when an update arrives, the bot looks up the Telegram `chat_id` against the TaskNexus user database (`GET /users/telegram/:chatId`). If no matching user exists, the request is rejected with an error message. This ensures only registered users can interact with the bot, even if the webhook URL were discovered by a third party.

3. **LLM system prompt enforcement** — both the Claude and GPT agents are explicitly instructed in their system prompts to only access records belonging to the authenticated user (identified by their internal user ID and Telegram ID), to never trust user-supplied IDs, and to never expose any user or Telegram IDs in their responses. This acts as a guardrail at the AI layer, preventing prompt injection attempts from tricking the agent into reading or modifying another user's data.
