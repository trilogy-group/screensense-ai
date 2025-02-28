import { type Tool as GoogleTool, Schema, SchemaType } from '@google/generative-ai';

// Enum to distinguish between built-in and MCP tools
export enum ToolType {
  BUILT_IN = 'built_in',
  MCP = 'mcp',
}

export interface Tool {
  type: ToolType;
  name: string;
  description: string;
  parameters?: Schema; // Using Google's Schema directly
  // Additional properties for MCP tools can be added here
  mcpEndpoint?: string;
}

// Base assistant configuration interface
export interface AssistantConfig {
  id?: string; // Optional as it may be assigned later
  displayName: string;
  description: string;
  systemInstruction: string;
  tools: Tool[];
  requiresDisplay: boolean;
}

// Utility to convert our Tool format to Google's Tool format
export function convertToGoogleTool(tool: Tool): GoogleTool {
  // Extract only the properties needed for Google's function declaration
  const { name, description, parameters } = tool;

  // Return as a Google Tool with a single function declaration using spread operator
  return {
    functionDeclarations: [
      {
        name,
        description,
        ...(parameters !== undefined ? { parameters } : {}),
      },
    ],
  } as GoogleTool;
}

// Utility to convert an array of our tools to Google's Tool format
export function convertToolsToGoogleFormat(tools: Tool[]): GoogleTool[] {
  // We need to group tools by their type for Google's format
  const groupedTools: Record<string, GoogleTool> = {};

  // Group built-in tools (each goes to its own Google Tool)
  tools
    .filter(tool => tool.type === ToolType.BUILT_IN)
    .forEach(tool => {
      const googleTool = convertToGoogleTool(tool);
      groupedTools[tool.name] = googleTool;
    });

  // Special handling for MCP tools (can be grouped differently if needed)
  tools
    .filter(tool => tool.type === ToolType.MCP)
    .forEach(tool => {
      // For now, just convert each MCP tool like a built-in tool
      const googleTool = convertToGoogleTool(tool);
      groupedTools[tool.name] = googleTool;
    });

  // Convert the grouped record to an array
  return Object.values(groupedTools);
}
