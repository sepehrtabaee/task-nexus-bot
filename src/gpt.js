import { config } from './config.js';
import { listTools, callTool } from './mcp.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function buildSystemPrompt(userId, telegramId) {
  return `You are a helpful assistant connected to a task manager.
          Use the available tools to read, create, update, or delete tasks as needed.
          The user you are talking to has the following IDs:
          - Internal user ID: ${userId}
          - Telegram ID: ${telegramId}
          Make sure the user can only access their own records, only trust the provided IDs.
          Do not give user back any user ids or telegram ids in your responses.
          Be concise in your responses.`;
}

// MCP tools use Anthropic's `input_schema`; OpenAI expects `parameters` under a `function` wrapper.
async function listOpenAITools() {
  const tools = await listTools();
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

async function chatCompletion(body) {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI chat completion failed: ${res.status} ${err}`);
  }
  return res.json();
}

// Runs a full agentic loop: sends the user message, handles tool calls,
// and returns the final text reply (or null if the model has nothing to say).
export async function processMessage(userText, userId, telegramId, history = []) {
  const tools = await listOpenAITools();
  const messages = [
    { role: 'system', content: buildSystemPrompt(userId, telegramId) },
    ...history,
    { role: 'user', content: userText },
  ];

  while (true) {
    const response = await chatCompletion({
      model: 'gpt-5-mini',
      max_tokens: 4096,
      tools,
      messages,
    });

    const choice = response.choices[0];
    const message = choice.message;
    messages.push(message);

    // Model is done — return final text
    if (choice.finish_reason === 'stop') {
      return message.content ?? null;
    }

    // Model wants to use tools — execute them and feed results back
    if (choice.finish_reason === 'tool_calls') {
      const toolResults = await executeToolCalls(message.tool_calls);
      messages.push(...toolResults);
      continue;
    }

    console.warn('Unexpected finish_reason:', choice.finish_reason);
    break;
  }

  return null;
}

async function executeToolCalls(toolCalls) {
  return Promise.all(
    toolCalls.map(async (call) => {
      const name = call.function.name;
      let input;
      try {
        input = JSON.parse(call.function.arguments || '{}');
      } catch (err) {
        return {
          role: 'tool',
          tool_call_id: call.id,
          content: `Error: invalid JSON arguments: ${err.message}`,
        };
      }

      console.log(`[tool] ${name}`, input);
      try {
        const result = await callTool(name, input);
        return {
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result.content),
        };
      } catch (err) {
        console.error(`[tool] ${name} failed:`, err.message);
        return {
          role: 'tool',
          tool_call_id: call.id,
          content: `Error: ${err.message}`,
        };
      }
    }),
  );
}
