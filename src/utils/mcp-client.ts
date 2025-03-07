import { Schema, SchemaType } from '@google/generative-ai';
import { Tool, ToolType } from '../configs/assistant-types';
import { ipcRenderer } from 'electron';

/**
 * Client for interacting with MCP (Machine Capability Protocol) endpoints
 */
export class McpClient {
  private url: string;
  private connected: boolean = false;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Initialize the connection to the MCP endpoint
   */
  public async initialize(): Promise<void> {
    try {
      const result = await ipcRenderer.invoke('mcp:create', this.url);

      if (!result.success) {
        throw new Error(result.error || 'Failed to initialize MCP client');
      }

      this.connected = true;
    } catch (error) {
      console.error('Failed to initialize MCP client:', error);
      throw error;
    }
  }

  /**
   * Close the connection to the MCP endpoint
   */
  public async close(): Promise<void> {
    if (this.connected) {
      try {
        const result = await ipcRenderer.invoke('mcp:close', this.url);

        if (!result.success) {
          throw new Error(result.error || 'Failed to close MCP client');
        }

        this.connected = false;
      } catch (error) {
        console.error('Failed to close MCP client:', error);
        throw error;
      }
    }
  }

  /**
   * List available tools from the MCP endpoint
   */
  public async listTools(): Promise<Tool[]> {
    if (!this.connected) {
      throw new Error('Client not connected');
    }

    try {
      const result = await ipcRenderer.invoke('mcp:listTools', this.url);

      if (!result.success) {
        throw new Error(result.error || 'Failed to list tools');
      }

      // Convert the tools to our Tool type
      return result.tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description || '',
        type: ToolType.MCP,
        mcpEndpoint: this.url,
        ...(tool.inputSchema && {
          parameters: tool.inputSchema,
        }),
      }));
    } catch (error) {
      console.error('Failed to list tools:', error);
      throw error;
    }
  }

  /**
   * Determine the tool type from the tool metadata
   */
  private getToolType(tool: any): ToolType {
    // Logic to determine tool type based on the tool
    // This might need to be adjusted based on the actual data
    if (tool.type) {
      return tool.type as ToolType;
    }
    return 'function' as ToolType;
  }

  /**
   * Execute a tool on the MCP endpoint
   */
  public async executeTool(name: string, args: any): Promise<any> {
    if (!this.connected) {
      throw new Error('Client not connected');
    }

    try {
      const result = await ipcRenderer.invoke('mcp:executeTool', this.url, name, args);

      if (!result.success) {
        throw new Error(result.error || 'Failed to execute tool');
      }

      return result.result;
    } catch (error) {
      console.error(`Failed to execute tool ${name}:`, error);
      throw error;
    }
  }
}

/**
 * Create and initialize an MCP client
 */
export async function createMcpClient(url: string): Promise<McpClient> {
  const client = new McpClient(url);
  await client.initialize();
  return client;
}
