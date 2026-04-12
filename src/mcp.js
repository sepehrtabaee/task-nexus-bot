import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from './config.js';

let client = null;

async function getClient() {
  if (client) return client;

  const transport = new StreamableHTTPClientTransport(new URL(config.mcpUrl), {
    requestInit: {
      headers: { 'Authorization': `Bearer ${config.mcpToken}` },
    },
  });
  client = new Client(
    { name: 'telegram-claude-bot', version: '1.0.0' },
    { timeout: 30000 },
  );
  await client.connect(transport);

  console.log('MCP client connected to', config.mcpUrl);
  return client;
}

// Returns tools formatted for the Anthropic SDK
export async function listTools() {
  const mcp = await getClient();
  const { tools } = await mcp.listTools();

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

export async function callTool(name, input) {
  const mcp = await getClient();
  return mcp.callTool({ name, arguments: input });
}
