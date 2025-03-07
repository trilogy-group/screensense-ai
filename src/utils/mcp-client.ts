import { Tool, ToolType } from '../configs/assistant-types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

/**
 * Client for interacting with MCP (Machine Capability Protocol) endpoints
 */
export class McpClient {
  private url: string;
  private client: Client | null = null;
  private connected: boolean = false;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Initialize the connection to the MCP endpoint
   */
  public async initialize(): Promise<void> {
    try {
      // Create the SSE transport with URL object
      const transport = new SSEClientTransport(new URL(this.url));

      // Create the MCP client
      this.client = new Client(
        {
          name: 'screensense-ai',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      // Connect to the MCP endpoint
      await this.client.connect(transport);
      this.connected = true;
      console.log(`MCP connection opened to ${this.url}`);
    } catch (error) {
      console.error(`Failed to connect to MCP endpoint: ${this.url}`, error);
      throw error;
    }
  }

  /**
   * Close the connection to the MCP endpoint
   */
  public async close(): Promise<void> {
    if (this.client) {
      try {
        // Since no disconnect method exists, we'll just nullify our reference
        this.client = null;
        this.connected = false;
      } catch (error) {
        console.error(`Error disconnecting from MCP endpoint: ${this.url}`, error);
      }
    }
  }

  /**
   * List all available tools from the MCP endpoint
   */
  public async listTools(): Promise<Tool[]> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected');
    }

    try {
      // List tools from the MCP endpoint
      const mcpTools = await this.client.listTools();

      console.log(`MCP tools: ${JSON.stringify(mcpTools, null, 2)}`);

      // Convert MCP tools to our Tool format
      return (mcpTools as unknown as any[]).map((tool: any) => ({
        type: ToolType.MCP,
        name: tool.name,
        description: tool.description || '', // Provide a default empty string if description is not available
        parameters: tool.parameters || {}, // Provide a default empty object if parameters is not available
        mcpEndpoint: this.url,
      }));
    } catch (error) {
      console.error(`Failed to list tools from MCP endpoint: ${this.url}`, error);
      throw error;
    }
  }

  /**
   * Execute a tool with the given name and arguments
   */
  public async executeTool(name: string, args: any): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected');
    }

    try {
      // Call the tool via the MCP client
      const result = await this.client.callTool({
        name,
        arguments: args,
      });

      return result;
    } catch (error) {
      console.error(`Failed to execute tool ${name} from MCP endpoint: ${this.url}`, error);
      throw error;
    }
  }
}

/**
 * Utility function to create an MCP client and initialize it
 */
export async function createMcpClient(url: string): Promise<McpClient> {
  const client = new McpClient(url);
  await client.initialize();
  return client;
}
