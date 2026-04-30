import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { config } from '../config.js';

export function getModel() {
  if (config.llmProvider === 'openai') {
    // gpt-5-mini is a reasoning model: requires `max_completion_tokens`, rejects `max_tokens`.
    return new ChatOpenAI({
      apiKey: config.openaiApiKey,
      model: 'gpt-5-mini',
      modelKwargs: { max_completion_tokens: 4096 },
    });
  }

  return new ChatAnthropic({
    apiKey: config.anthropicApiKey,
    model: 'claude-sonnet-4-6',
    maxTokens: 4096,
  });
}
