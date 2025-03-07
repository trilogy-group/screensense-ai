import { ToolType } from './assistant-types';
import { Tool, AssistantConfig } from './assistant-types';
import { Schema } from '@google/generative-ai';

/**
 * API Tool Interface - represents a tool as returned from the API
 */
export interface ApiTool {
  toolId: string;
  type: string; // Matches ToolType enum as string
  name: string;
  description: string;
  parameters?: Schema; // Use Schema type from Google's package
  mcpEndpoint?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * API Assistant Interface - represents an assistant as returned from the API
 */
export interface ApiAssistant {
  assistantId: string;
  displayName: string;
  description: string;
  systemInstruction: string;
  requiresDisplay: boolean;
  tools: ApiTool[];
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  isInstalled: boolean;
}

/**
 * API User Interface - represents user data as returned from the API
 */
export interface ApiUser {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Complete API response from /users/me endpoint
 */
export interface ApiUserResponse {
  user: ApiUser;
  assistants: ApiAssistant[];
}

/**
 * Convert an API Tool to our internal Tool format
 */
export function convertApiToolToTool(apiTool: ApiTool): Tool {
  return {
    type: apiTool.type as ToolType, // Map string to enum
    name: apiTool.name,
    description: apiTool.description,
    parameters: apiTool.parameters,
    mcpEndpoint: apiTool.mcpEndpoint,
  };
}

/**
 * Convert an API Assistant to our internal AssistantConfig format
 */
export function convertApiAssistantToAssistantConfig(apiAssistant: ApiAssistant): AssistantConfig {
  // Convert each tool from the API format to our internal format
  const tools = apiAssistant.tools.map(convertApiToolToTool);

  return {
    id: apiAssistant.assistantId,
    displayName: apiAssistant.displayName,
    description: apiAssistant.description,
    systemInstruction: apiAssistant.systemInstruction,
    tools,
    requiresDisplay: apiAssistant.requiresDisplay,
  };
}

/**
 * Convert an array of API Assistants to a record of id -> AssistantConfig
 * This is useful for lookup by ID
 */
export function convertApiAssistantsToRecord(
  apiAssistants: ApiAssistant[]
): Record<string, AssistantConfig> {
  return apiAssistants.reduce(
    (acc, assistant) => {
      const config = convertApiAssistantToAssistantConfig(assistant);
      acc[config.id] = config;
      return acc;
    },
    {} as Record<string, AssistantConfig>
  );
}
