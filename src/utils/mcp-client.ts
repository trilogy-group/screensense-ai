import { Tool, ToolType } from '../configs/assistant-types';

interface McpTool {
  name: string;
  description: string;
  parameters: any; // Schema object
}

interface McpToolsResponse {
  tools: McpTool[];
}

interface McpExecuteResponse {
  result: any;
}

/**
 * Client for interacting with MCP (Machine Capability Protocol) endpoints
 */
export class McpClient {
  private url: string;
  private eventSource: EventSource | null = null;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private nextMessageId: number = 1;
  private connected: boolean = false;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Initialize the connection to the MCP endpoint
   */
  public async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.eventSource) {
        this.close();
      }

      try {
        this.eventSource = new EventSource(this.url);

        this.eventSource.onopen = () => {
          console.log(`MCP connection opened to ${this.url}`);
          this.connected = true;
          this.sendInitialize().then(resolve).catch(reject);
        };

        this.eventSource.onerror = error => {
          console.error(`MCP connection error for ${this.url}:`, error);
          if (!this.connected) {
            reject(new Error(`Failed to connect to MCP endpoint: ${this.url}`));
          }
        };

        this.eventSource.onmessage = event => {
          try {
            const data = JSON.parse(event.data);
            const { id } = data;

            if (id && this.messageHandlers.has(id)) {
              const handler = this.messageHandlers.get(id);
              if (handler) {
                handler(data);
                this.messageHandlers.delete(id);
              }
            }
          } catch (error) {
            console.error(`Error processing MCP message:`, error);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Close the connection to the MCP endpoint
   */
  public close(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.connected = false;
      this.messageHandlers.clear();
    }
  }

  /**
   * List all available tools from the MCP endpoint
   */
  public async listTools(): Promise<Tool[]> {
    const response = await this.sendRequest<McpToolsResponse>({
      method: 'list_tools',
    });

    // Convert MCP tools to our Tool format
    return response.tools.map(tool => ({
      type: ToolType.MCP,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      mcpEndpoint: this.url,
    }));
  }

  /**
   * Execute a tool with the given name and arguments
   */
  public async executeTool(name: string, args: any): Promise<any> {
    const response = await this.sendRequest<McpExecuteResponse>({
      method: 'execute',
      params: {
        name,
        arguments: args,
      },
    });

    return response.result;
  }

  private async sendInitialize(): Promise<void> {
    await this.sendRequest<{}>({
      method: 'initialize',
      params: {
        version: '0.1',
      },
    });
  }

  private async sendRequest<T>(request: any): Promise<T> {
    if (!this.eventSource || !this.connected) {
      throw new Error('MCP client not connected');
    }

    return new Promise((resolve, reject) => {
      const id = String(this.nextMessageId++);
      const message = {
        jsonrpc: '2.0',
        id,
        ...request,
      };

      // Set up handler for response
      this.messageHandlers.set(id, data => {
        if (data.error) {
          reject(new Error(`MCP error: ${JSON.stringify(data.error)}`));
        } else {
          resolve(data.result as T);
        }
      });

      // Send the request
      const jsonMessage = JSON.stringify(message);
      const encoder = new TextEncoder();
      const encoded = encoder.encode(jsonMessage);

      // Send using fetch to post data
      fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonMessage,
      }).catch(error => {
        this.messageHandlers.delete(id);
        reject(error);
      });
    });
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
