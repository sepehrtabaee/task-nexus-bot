import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
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

async function loadTools() {
  const mcpTools = await listTools();
  return mcpTools.map((t) =>
    tool(
      async (input) => {
        const result = await callTool(t.name, input);
        return JSON.stringify(result.content);
      },
      {
        name: t.name,
        description: t.description,
        schema: t.input_schema,
      },
    ),
  );
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
  const tools = await loadTools();
  const toolsByName = Object.fromEntries(tools.map((t) => [t.name, t]));
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
        const content = await toolsByName[call.name].invoke(call.args);
        messages.push(new ToolMessage({ content, tool_call_id: call.id }));
      } catch (err) {
        console.error(`[tool] ${call.name} failed:`, err.message);
        messages.push(
          new ToolMessage({ content: `Error: ${err.message}`, tool_call_id: call.id }),
        );
      }
    }
  }
}
