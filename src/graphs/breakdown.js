import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { listTools, callTool } from '../mcp.js';
import { getModel } from '../llm/provider.js';

const MAX_REFINE_ITERATIONS = 2;

const SubtaskSchema = z.object({
  title: z.string().describe('Short imperative title, e.g. "Find a beginner guitar class"'),
  description: z.string().describe('1-2 sentences explaining what to do and why'),
  order: z.number().int().describe('1-based ordering of this subtask within the plan'),
});

const PlanSchema = z.object({
  subtasks: z.array(SubtaskSchema).min(2).max(10),
});

const CritiqueSchema = z.object({
  approved: z.boolean().describe('True if every subtask is concrete and actionable'),
  feedback: z.string().describe('If not approved, what to fix. Empty string when approved.'),
});

const State = Annotation.Root({
  goal: Annotation(),
  parentTaskId: Annotation(),
  userId: Annotation(),
  telegramId: Annotation(),
  subtasks: Annotation(),
  critique: Annotation(),
  iterations: Annotation({ reducer: (_, next) => next, default: () => 0 }),
  approved: Annotation(),
  created: Annotation(),
});

async function planNode(state) {
  const llm = getModel().withStructuredOutput(PlanSchema, { name: 'plan' });

  const critiqueLine = state.critique
    ? `\n\nThe previous attempt was rejected with this feedback — fix it:\n${state.critique}`
    : '';

  const prompt = `Break the following goal into a concrete, ordered list of subtasks the user can actually do.

Goal: ${state.goal}

Rules:
- Each subtask is one specific, actionable step (no vague items like "get started" or "learn the basics").
- Order them so completing them in sequence makes progress toward the goal.
- 3-7 subtasks is usually right; never fewer than 2 or more than 10.${critiqueLine}`;

  const result = await llm.invoke([new HumanMessage(prompt)]);
  return { subtasks: result.subtasks };
}

async function refineNode(state) {
  const llm = getModel().withStructuredOutput(CritiqueSchema, { name: 'critique' });

  const prompt = `You are reviewing a task breakdown for quality. Goal: "${state.goal}"

Proposed subtasks:
${state.subtasks.map((s) => `${s.order}. ${s.title} — ${s.description}`).join('\n')}

Approve only if EVERY subtask is concrete and actionable (something the user can start today without further planning). Reject if any subtask is vague, redundant, or assumes another step that wasn't listed. When rejecting, give one short paragraph of feedback the planner can act on.`;

  const result = await llm.invoke([new HumanMessage(prompt)]);
  return {
    approved: result.approved,
    critique: result.feedback,
    iterations: (state.iterations ?? 0) + 1,
  };
}

function refineRouter(state) {
  if (state.approved) return 'persist';
  if ((state.iterations ?? 0) >= MAX_REFINE_ITERATIONS) return 'persist';
  return 'plan';
}

// Persist node: small tool-loop that uses the same MCP tools the main agent has,
// scoped to creating these subtasks. Lets the LLM figure out the right MCP tool
// signature without us hardcoding it here.
async function persistNode(state) {
  const mcpTools = await listTools();
  const toolDefs = mcpTools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
  const llm = getModel().bindTools(toolDefs);

  const system = `You are creating tasks in a task manager via MCP tools.
The user's internal ID is ${state.userId} and Telegram ID is ${state.telegramId}.${
    state.parentTaskId ? ` These subtasks belong to parent task ${state.parentTaskId}.` : ''
  }
Create each subtask below as its own task. Use the create-task tool from your tool list.
Only create tasks — do not read, update, or delete anything else.
When every subtask has been created, reply with a one-line confirmation and stop.`;

  const userMsg = `Create these subtasks for the goal "${state.goal}":\n\n${state.subtasks
    .map((s) => `${s.order}. ${s.title} — ${s.description}`)
    .join('\n')}`;

  const messages = [new SystemMessage(system), new HumanMessage(userMsg)];
  const created = [];

  for (let step = 0; step < 20; step++) {
    const ai = await llm.invoke(messages);
    messages.push(ai);

    if (!ai.tool_calls?.length) break;

    for (const call of ai.tool_calls) {
      console.log(`[breakdown:persist] ${call.name}`, call.args);
      try {
        const result = await callTool(call.name, call.args);
        created.push({ tool: call.name, args: call.args, result: result.content });
        messages.push(
          new ToolMessage({ content: JSON.stringify(result.content), tool_call_id: call.id }),
        );
      } catch (err) {
        console.error(`[breakdown:persist] ${call.name} failed:`, err.message);
        messages.push(
          new ToolMessage({ content: `Error: ${err.message}`, tool_call_id: call.id }),
        );
      }
    }
  }

  return { created };
}

const graph = new StateGraph(State)
  .addNode('plan', planNode)
  .addNode('refine', refineNode)
  .addNode('persist', persistNode)
  .addEdge(START, 'plan')
  .addEdge('plan', 'refine')
  .addConditionalEdges('refine', refineRouter, { plan: 'plan', persist: 'persist' })
  .addEdge('persist', END)
  .compile();

export async function breakDownTask({ goal, parentTaskId, userId, telegramId }) {
  const final = await graph.invoke({ goal, parentTaskId, userId, telegramId });
  return {
    goal,
    subtasks: final.subtasks,
    iterations: final.iterations,
    approved: final.approved,
    createdCount: final.created?.length ?? 0,
  };
}
