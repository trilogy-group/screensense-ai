import { Schema, SchemaType } from '@google/generative-ai';
import { Tool, ToolType } from '../configs/assistant-types';
import { ipcRenderer } from 'electron';

/**
 * Client for interacting with MCP (Machine Capability Protocol) endpoints
 */

const mcpTools: Map<string, Tool[]> = new Map();

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

        // Remove tools for this endpoint
        mcpTools.delete(this.url);

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
      const tools: Tool[] = result.tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description || '',
        type: ToolType.MCP,
        mcpEndpoint: this.url,
        parameters: tool.inputSchema ? convertToGoogleSchema(tool.inputSchema) : {},
      }));

      // Store the tools for this endpoint
      mcpTools.set(this.url, tools);

      return tools;
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

// Convert MCP inputSchema to Google Schema format
const convertToGoogleSchema = (inputSchema: any): any => {
  // If schema is null or undefined, return empty object
  if (!inputSchema) return {};

  // Store definitions for reference resolution
  const definitions: Record<string, any> = {};

  // Extract all definitions from $defs if present
  if (inputSchema.$defs) {
    Object.entries(inputSchema.$defs).forEach(([key, def]) => {
      definitions[`#/$defs/${key}`] = def;
    });
  }

  // Handle $ref resolution with cycle detection
  const resolveRef = (ref: string, visitedRefs: Set<string> = new Set()): any => {
    // Prevent infinite recursion
    if (visitedRefs.has(ref)) {
      return { type: 'OBJECT' }; // Default for circular references
    }

    visitedRefs.add(ref);

    // Find the definition
    const def = definitions[ref];
    if (!def) {
      console.warn(`Reference "${ref}" not found in definitions`);
      return { type: 'OBJECT' };
    }

    // Convert the resolved reference
    return convertSchema(def, visitedRefs);
  };

  // Main schema conversion function (recursive)
  const convertSchema = (schema: any, visitedRefs: Set<string> = new Set()): any => {
    // Handle reference first
    if (schema.$ref) {
      return resolveRef(schema.$ref, visitedRefs);
    }

    // Handle direct schema
    const result: any = {};

    // Convert type
    if (schema.type) {
      result.type =
        schema.type === 'object'
          ? 'OBJECT'
          : schema.type === 'string'
            ? 'STRING'
            : schema.type === 'number'
              ? 'NUMBER'
              : schema.type === 'integer'
                ? 'INTEGER'
                : schema.type === 'boolean'
                  ? 'BOOLEAN'
                  : schema.type === 'array'
                    ? 'ARRAY'
                    : schema.type.toUpperCase();
    } else {
      // Default to OBJECT if no type
      result.type = 'OBJECT';
    }

    // Copy description
    if (schema.description) {
      result.description = schema.description;
    }

    // Copy format
    if (schema.format) {
      result.format = schema.format;
    }

    // Handle anyOf pattern (common for nullable fields)
    if (schema.anyOf) {
      const nonNullType = schema.anyOf.find((t: any) => t.type !== 'null');
      if (nonNullType) {
        // Recursively convert the non-null option
        const converted = convertSchema(nonNullType, visitedRefs);
        Object.assign(result, converted);
        // Explicitly set nullable if we found a null option
        result.nullable = true;
      }
    }

    // Handle array items
    if (schema.items) {
      result.items = convertSchema(schema.items, visitedRefs);
    }

    // Handle properties for objects
    if (schema.properties) {
      result.properties = {};
      Object.entries(schema.properties).forEach(([propName, propSchema]: [string, any]) => {
        result.properties[propName] = convertSchema(propSchema, visitedRefs);
      });

      // Include required array if present
      if (schema.required && schema.required.length > 0) {
        result.required = schema.required;
      }
    } else if (result.type === 'OBJECT') {
      // Handle free-form objects (objects without defined properties)
      result.properties = {
        // Add an example property to satisfy Google's Schema requirements
        key: {
          type: 'STRING',
          description: 'Example property. You can specify any property names and values.',
        },
      };

      // Update description to make it clear that any properties are allowed
      if (result.description) {
        if (
          !result.description.includes('arbitrary') &&
          !result.description.includes('any properties')
        ) {
          result.description +=
            ' This is a free-form object that accepts arbitrary key-value pairs.';
        }
      } else {
        result.description = 'A free-form object that accepts arbitrary key-value pairs.';
      }
    }

    return result;
  };

  // Start the conversion with the main schema
  return convertSchema(inputSchema);
};

export function getMcpTools(): Tool[] {
  return Array.from(mcpTools.values()).flat();
}
