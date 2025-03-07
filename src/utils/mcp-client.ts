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
   * Convert JSON Schema to Google AI SDK compatible format
   * This simplifies complex JSON Schema structures into a format Google AI SDK can understand
   */
  private convertJsonSchemaToParameters(schema: any): any {
    // If schema is null or undefined, return empty object
    if (!schema) return {};

    // Handle root schema object
    if (schema.type === 'object' && schema.properties) {
      const convertedProperties: Record<string, any> = {};

      // Process each property
      for (const [propName, propSchema] of Object.entries<any>(schema.properties)) {
        // Extract type information
        let type: string | string[] = 'string'; // Default type
        let description = propSchema.description || '';
        let enumValues: string[] | undefined;

        // Handle anyOf - usually means optional or union types
        if (propSchema.anyOf) {
          // Extract possible types from anyOf
          const types = propSchema.anyOf
            .filter((item: any) => item.type)
            .map((item: any) => item.type);

          // If one type is null, it's optional
          if (types.includes('null')) {
            // It's an optional field, but we don't need to do anything special here
            // Google's format doesn't have explicit optional markers
            // Just use the non-null type
            type = types.filter((t: string) => t !== 'null')[0] || 'string';
          } else if (types.length > 0) {
            // Union type
            type = types;
          }

          // Check for references in anyOf
          for (const item of propSchema.anyOf) {
            if (item.$ref && item.$ref.startsWith('#/$defs/')) {
              // This is a reference to a complex object - for simplicity
              // just mark as object type with the referenced type in description
              type = 'object';
              const refName = item.$ref.split('/').pop();
              description += ` (Type: ${refName})`;
              break;
            }
          }
        } else if (propSchema.type) {
          // Simple type
          type = propSchema.type;
        }

        // Handle array type with items
        if (type === 'array' && propSchema.items) {
          if (propSchema.items.type) {
            type = `array<${propSchema.items.type}>`;
          } else if (propSchema.items.$ref) {
            // Reference to complex type
            const refName = propSchema.items.$ref.split('/').pop();
            type = `array<object>`;
            description += ` (Items type: ${refName})`;
          }
        }

        // Handle enum values
        if (propSchema.enum) {
          enumValues = propSchema.enum;
        }

        // Create simplified property definition
        convertedProperties[propName] = {
          type: type,
          description: description,
          ...(enumValues && { enum: enumValues }),
          ...(propSchema.default !== undefined && { default: propSchema.default }),
        };
      }

      return convertedProperties;
    }

    // If not an object schema or doesn't have properties, return empty object
    return {};
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
        parameters: tool.inputSchema ? this.convertJsonSchemaToParameters(tool.inputSchema) : {},
      }));
    } catch (error) {
      console.error('Failed to list tools:', error);
      throw error;
    }
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
