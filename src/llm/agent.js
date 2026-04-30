import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { listTools, callTool } from '../mcp.js';
import { getModel } from './provider.js';

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

// Returns OpenAI-format tool defs. Both ChatOpenAI and ChatAnthropic bindTools
// accept this shape and translate internally — avoids the Zod path that
// chokes on JSON Schema from MCP.
async function loadToolDefs() {
  const mcpTools = await listTools();
  return mcpTools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

function toLangChainHistory(history) {
  return history.map((m) =>
    m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
  );
}

// LangChain returns content as either a string or an array of blocks (Anthropic shape).
function extractText(content) {
  if (typeof content === 'string') return content || null;
  if (Array.isArray(content)) {
    return content.find((b) => b.type === 'text')?.text ?? null;
  }
  return null;
}

export async function processMessage(userText, userId, telegramId, history = []) {
  const tools = await loadToolDefs();
  const llm = getModel().bindTools(tools);

  const messages = [
    new SystemMessage(buildSystemPrompt(userId, telegramId)),
    ...toLangChainHistory(history),
    new HumanMessage(userText),
  ];

  while (true) {
    const ai = await llm.invoke(messages);
    messages.push(ai);

    if (!ai.tool_calls?.length) {
      return extractText(ai.content);
    }

    for (const call of ai.tool_calls) {
      console.log(`[tool] ${call.name}`, call.args);
      try {
        const result = await callTool(call.name, call.args);
        messages.push(
          new ToolMessage({ content: JSON.stringify(result.content), tool_call_id: call.id }),
        );
      } catch (err) {
        console.error(`[tool] ${call.name} failed:`, err.message);
        messages.push(
          new ToolMessage({ content: `Error: ${err.message}`, tool_call_id: call.id }),
        );
      }
    }
  }
}
