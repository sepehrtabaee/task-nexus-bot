import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { listTools, callTool } from '../mcp.js';
import { breakDownTask } from '../graphs/breakdown.js';
import { getModel } from './provider.js';

const BREAKDOWN_TOOL_NAME = 'break_down_task';

const breakdownToolDef = {
  type: 'function',
  function: {
    name: BREAKDOWN_TOOL_NAME,
    description:
      'Break a high-level goal into concrete, ordered subtasks and create them in the task manager. ' +
      'Only call when the user explicitly asks to break down, decompose, or plan out a goal ' +
      '(e.g. "break down learning guitar"). Do NOT call for normal task creation.',
    parameters: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'The high-level goal stated by the user, e.g. "learn guitar".',
        },
        parentTaskId: {
          type: 'string',
          description: 'Optional ID of an existing parent task these subtasks belong under.',
        },
      },
      required: ['goal'],
      additionalProperties: false,
    },
  },
};

function buildSystemPrompt(userId, telegramId) {
  return `You are a helpful assistant connected to a task manager.
          Use the available tools to read, create, update, or delete tasks as needed.
          When the user explicitly asks to break down, decompose, or plan out a goal,
          call the ${BREAKDOWN_TOOL_NAME} tool instead of creating tasks one by one.
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
  const mcpDefs = mcpTools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
  return [...mcpDefs, breakdownToolDef];
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

async function dispatchTool(call, { userId, telegramId }) {
  if (call.name === BREAKDOWN_TOOL_NAME) {
    const summary = await breakDownTask({
      goal: call.args.goal,
      parentTaskId: call.args.parentTaskId,
      userId,
      telegramId,
    });
    return { content: summary };
  }
  return callTool(call.name, call.args);
}

export async function processMessage(userText, userId, telegramId, history = []) {
  console.log(`[agent] processMessage userId=${userId} historyLen=${history.length} text=${JSON.stringify(userText).slice(0, 120)}`);
  const tools = await loadToolDefs();
  const llm = getModel().bindTools(tools);

  const messages = [
    new SystemMessage(buildSystemPrompt(userId, telegramId)),
    ...toLangChainHistory(history),
    new HumanMessage(userText),
  ];

  let iter = 0;
  while (true) {
    iter += 1;
    console.log(`[agent] iter=${iter} invoking llm (messages=${messages.length})`);
    const ai = await llm.invoke(messages);
    messages.push(ai);

    if (!ai.tool_calls?.length) {
      console.log(`[agent] iter=${iter} done, no tool calls`);
      return extractText(ai.content);
    }

    console.log(`[agent] iter=${iter} llm requested ${ai.tool_calls.length} tool call(s)`);
    for (const call of ai.tool_calls) {
      console.log(`[tool] ${call.name}`, call.args);
      try {
        const result = await dispatchTool(call, { userId, telegramId });
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
