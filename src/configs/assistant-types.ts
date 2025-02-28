import { type Tool as GoogleTool, Schema, SchemaType } from '@google/generative-ai';

// Enum to distinguish between built-in and MCP tools
export enum ToolType {
  BUILT_IN = 'built_in',
  MCP = 'mcp',
  GOOGLE_SEARCH = 'google_search',
  CODE_EXECUTION = 'code_execution',
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
  id: string;
  displayName: string;
  description: string;
  systemInstruction: string;
  tools: readonly Tool[];
  requiresDisplay: boolean;
}

// Utility to convert an array of our tools to Google's Tool format
export function convertToolsToGoogleFormat(
  tools: Tool[]
): Array<GoogleTool | { googleSearch: {} } | { codeExecution: {} }> {
  // If there are no tools, return an empty array
  if (tools.length === 0) {
    return [];
  }

  // Split tools into regular function tools and special Google tools
  const regularTools: Tool[] = [];
  const specialTools: Array<{ googleSearch: {} } | { codeExecution: {} }> = [];

  // Process each tool
  tools.forEach(tool => {
    if (tool.type === ToolType.GOOGLE_SEARCH) {
      specialTools.push({ googleSearch: {} });
    } else if (tool.type === ToolType.CODE_EXECUTION) {
      specialTools.push({ codeExecution: {} });
    } else {
      regularTools.push(tool);
    }
  });

  // Convert regular tools to function declarations
  const result: Array<GoogleTool | { googleSearch: {} } | { codeExecution: {} }> = [];

  // Only add the function tool if we have regular tools
  if (regularTools.length > 0) {
    const allFunctionDeclarations = regularTools.map(tool => {
      const { name, description, parameters } = tool;
      return {
        name,
        description,
        ...(parameters !== undefined ? { parameters } : {}),
      };
    });

    result.push({
      functionDeclarations: allFunctionDeclarations,
    } as GoogleTool);
  }

  // Add special tools
  return [...result, ...specialTools];
}
