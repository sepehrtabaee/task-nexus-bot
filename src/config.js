function require(name, value) {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: process.env.PORT || 3000,
  telegramToken: require('TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN),
  anthropicApiKey: require('ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY),
  webhookSecret: process.env.WEBHOOK_SECRET || null,
  mcpUrl: require('MCP_URL', process.env.MCP_URL),
};
