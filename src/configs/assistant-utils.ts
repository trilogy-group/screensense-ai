import { assistantConfigs } from './assistant-configs';
import { AssistantConfig } from './assistant-types';

/**
 * Get all assistant configurations
 */
export function getAllAssistants(): AssistantConfig[] {
  return Object.values(assistantConfigs);
}

/**
 * Get an assistant by ID
 */
export function getAssistantById(id: string): AssistantConfig | undefined {
  return assistantConfigs[id as keyof typeof assistantConfigs];
}

/**
 * Filter assistants by tool capability
 * This checks if an assistant has a tool with a specific name
 */
export function getAssistantsByToolName(toolName: string): AssistantConfig[] {
  return Object.values(assistantConfigs).filter(assistant => {
    return assistant.tools.some(tool => tool.name === toolName);
  });
}

/**
 * Get all unique tool names across all assistants
 */
export function getAllToolNames(): string[] {
  const toolNames = new Set<string>();

  Object.values(assistantConfigs).forEach(assistant => {
    assistant.tools.forEach(tool => {
      toolNames.add(tool.name);
    });
  });

  return Array.from(toolNames);
}

/**
 * Search assistants by keyword in name or description
 */
export function searchAssistants(query: string): AssistantConfig[] {
  const lowercaseQuery = query.toLowerCase();

  return Object.values(assistantConfigs).filter(assistant => {
    return (
      assistant.displayName.toLowerCase().includes(lowercaseQuery) ||
      (assistant.description && assistant.description.toLowerCase().includes(lowercaseQuery))
    );
  });
}
