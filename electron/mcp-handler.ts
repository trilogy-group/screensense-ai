import { ipcMain } from 'electron';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { logToFile } from '../src/utils/logger';

// Map to store MCP clients by URL
const mcpClients: Map<string, McpClientWrapper> = new Map();

/**
 * Wrapper for MCP Client with additional context
 */
class McpClientWrapper {
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
      // Create a new SSE transport with URL object
      const transport = new SSEClientTransport(new URL(this.url));

      // Initialize the client with the transport
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
      logToFile(`McpClient connected to ${this.url}`);
    } catch (error) {
      logToFile(
        `McpClient failed to connect to ${this.url}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Close the connection to the MCP endpoint
   */
  public async close(): Promise<void> {
    if (this.client && this.connected) {
      try {
        // Close the connection
        this.client = null;
        this.connected = false;
        logToFile(`McpClient disconnected from ${this.url}`);
      } catch (error) {
        logToFile(
          `McpClient failed to disconnect from ${this.url}: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    }
  }

  /**
   * List available tools from the MCP endpoint
   */
  public async listTools(): Promise<any[]> {
    if (!this.client || !this.connected) {
      throw new Error('Client not connected');
    }

    try {
      const tools = (await this.client.listTools()).tools;
      return tools as unknown as any[];
    } catch (error) {
      logToFile(
        `McpClient failed to list tools from ${this.url}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Execute a tool on the MCP endpoint
   */
  public async executeTool(name: string, args: any): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('Client not connected');
    }

    try {
      // Call the tool via the MCP client
      console.log(`Executing tool ${name} with args ${JSON.stringify(args)}`);
      const result = await this.client.callTool({
        name,
        arguments: args,
      });
      console.log(`Tool ${name} executed with result ${JSON.stringify(result)}`);

      return result;
    } catch (error) {
      logToFile(
        `McpClient failed to execute tool ${name} on ${this.url}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }
}

/**
 * Initialize the MCP handler and register IPC listeners
 */
export function initializeMcpHandler() {
  // Create or get MCP client
  ipcMain.handle('mcp:create', async (event, url: string) => {
    try {
      if (!mcpClients.has(url)) {
        const client = new McpClientWrapper(url);
        await client.initialize();
        mcpClients.set(url, client);
      }
      return { success: true, url };
    } catch (error) {
      logToFile(
        `Failed to create MCP client for ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Close MCP client
  ipcMain.handle('mcp:close', async (event, url: string) => {
    try {
      const client = mcpClients.get(url);
      if (client) {
        await client.close();
        mcpClients.delete(url);
      }
      return { success: true };
    } catch (error) {
      logToFile(
        `Failed to close MCP client for ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // List tools from MCP endpoint
  ipcMain.handle('mcp:listTools', async (event, url: string) => {
    try {
      const client = mcpClients.get(url);
      if (!client) {
        throw new Error(`No client found for ${url}`);
      }
      const tools = await client.listTools();
      return { success: true, tools };
    } catch (error) {
      logToFile(
        `Failed to list tools from ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Execute tool on MCP endpoint
  ipcMain.handle('mcp:executeTool', async (event, url: string, toolName: string, args: any) => {
    try {
      const client = mcpClients.get(url);
      if (!client) {
        throw new Error(`No client found for ${url}`);
      }
      const result = await client.executeTool(toolName, args);
      return { success: true, result };
    } catch (error) {
      logToFile(
        `Failed to execute tool ${toolName} on ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  logToFile('MCP handler initialized');
}
