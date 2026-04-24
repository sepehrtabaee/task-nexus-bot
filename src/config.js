// import dotenv from 'dotenv';
// dotenv.config();
function require(name, value) {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: process.env.PORT || 3000,
  llmProvider: process.env.LLM_PROVIDER || 'anthropic',
  anthropicApiKey: require('ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY),
  telegramToken: require('TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN),
  openaiApiKey: require('OPENAI_API_KEY', process.env.OPENAI_API_KEY),
  webhookSecret: process.env.WEBHOOK_SECRET || null,
  mcpUrl: require('MCP_URL', process.env.MCP_URL),
  mcpToken: require('MCP_TOKEN', process.env.MCP_TOKEN),
  apiUrl: require('API_URL', process.env.API_URL),
  supabaseUrl: require('SUPABASE_URL', process.env.SUPABASE_URL),
  supabaseAnonKey: require('SUPABASE_ANON_KEY', process.env.SUPABASE_ANON_KEY),
  supabaseBotEmail: require('SUPABASE_BOT_EMAIL', process.env.SUPABASE_BOT_EMAIL),
  supabaseBotPassword: require('SUPABASE_BOT_PASSWORD', process.env.SUPABASE_BOT_PASSWORD),
};
