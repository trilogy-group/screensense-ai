import { BaseMessage } from '@langchain/core/messages';
import { ChatAnthropic } from '@langchain/anthropic';
const { ipcRenderer } = window.require('electron');

// Common tool response types
export interface ToolResponse {
  name: string;
  response: {
    output: any;
  };
}

// Common agent response types
export interface AgentResponse {
  messages: BaseMessage[];
  intermediateSteps?: ActionStep[];
}

export interface ActionStep {
  action: {
    tool: string;
    toolInput: any;
  };
  observation: any;
}

// Recon agent specific types
export interface OrchestratorResponse {
  messages: BaseMessage[];
  toolCalls?: ToolResponse[];
}

// Recon agent specific types
export interface ReconResponse extends OrchestratorResponse {
  switchAgent?: boolean;
}

// Track which agent is currently active
export type ActiveAgent = 'recon' | 'novelty';

export async function initializeModel() {
  let model;
  const settings = await ipcRenderer.invoke('get-saved-settings');
  const apiKey = settings.anthropicApiKey;

  if (!apiKey) {
    console.error('❌ Anthropic API key not found in settings');
    throw new Error('Anthropic API key not found');
  }
  // console.log('✅ Got API key from settings');

  model = new ChatAnthropic({
    modelName: 'claude-3-7-sonnet-latest',
    temperature: 0,
    anthropicApiKey: apiKey,
    maxTokens: 8192,
  });
  return model;
}
