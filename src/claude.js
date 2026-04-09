import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { listTools, callTool } from './mcp.js';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

function buildSystemPrompt(userId, telegramId) {
  return `You are a helpful assistant connected to a task manager.
Use the available tools to read, create, update, or delete tasks as needed.
The user you are talking to has the following IDs:
- Internal user ID: ${userId}
- Telegram ID: ${telegramId}
Be concise in your responses.`;
}

// Runs a full agentic loop: sends the user message, handles tool calls,
// and returns the final text reply (or null if Claude has nothing to say).
export async function processMessage(userText, userId, telegramId, history = []) {
  const tools = await listTools();
  const messages = [...history, { role: 'user', content: userText }];

  while (true) {
    const response = await anthropic.messages.create({
      // claude-haiku-4-5
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: buildSystemPrompt(userId, telegramId),
      tools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    // Claude is done — extract the final text block
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock?.text ?? null;
    }

    // Claude wants to use tools — execute them and feed results back
    if (response.stop_reason === 'tool_use') {
      const toolResults = await executeToolCalls(response.content);
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unexpected stop reason
    console.warn('Unexpected stop_reason:', response.stop_reason);
    break;
  }

  return null;
}

async function executeToolCalls(contentBlocks) {
  const toolUseBlocks = contentBlocks.filter((b) => b.type === 'tool_use');

  const results = await Promise.all(
    toolUseBlocks.map(async (block) => {
      console.log(`[tool] ${block.name}`, block.input);
      try {
        const result = await callTool(block.name, block.input);
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result.content),
        };
      } catch (err) {
        console.error(`[tool] ${block.name} failed:`, err.message);
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error: ${err.message}`,
          is_error: true,
        };
      }
    }),
  );

  return results;
}
