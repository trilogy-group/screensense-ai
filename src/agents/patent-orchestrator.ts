import { BaseMessage } from '@langchain/core/messages';
import { initializeBackgroundAgent, invokeBackgroundAgent, resetBackgroundThread, sendImageToBackgroundAgent } from './background-orchestrator';
import { initializeNoveltyAgent, invokeNoveltyAgent, resetNoveltyThread, sendImageToNoveltyAgent } from './novelty-orchestrator';
const { ipcRenderer } = window.require('electron');

// Add types for tool responses
interface ToolResponse {
  name: string;
  response: {
    output: any;
  };
}

interface OrchestratorResponse {
  messages: BaseMessage[];
  toolCalls?: ToolResponse[];
}

// Track which agent is currently active
type ActiveAgent = 'background' | 'novelty';
let currentAgent: ActiveAgent = 'background';

// Initialize the orchestrator
export async function initializePatentAgent() {
  resetPatentThread();
  console.log('🚀 Initializing patent orchestrator');
  await initializeBackgroundAgent();
}

// Initialize when module loads
initializePatentAgent().catch(error => {
  console.error('❌ Failed to initialize patent agent:', error);
});

export async function invokePatentAgent(userMessage: string): Promise<OrchestratorResponse> {
  if (!userMessage || userMessage.trim() === '') {
    throw new Error('User message cannot be empty');
  }

  console.log('📨 [PatentOrchestrator] Message preview:', userMessage.slice(0, 100) + '...');
  console.log('🤖 Current agent:', currentAgent);

  try {
    let response;
    if (currentAgent === 'background') {
      response = await invokeBackgroundAgent(userMessage);
      
      // Debug tool calls
      console.log('🔍 [BackgroundOrchestrator] response', response);

      if (response.switch_agent) {
        console.log('🔄 Transitioning from background to novelty agent');
        
        // Read the current patent document
        currentAgent = 'novelty';
        const patentDoc = await ipcRenderer.invoke('read_patent');
        if (!patentDoc.success) {
          console.error('❌ Failed to read patent document during transition');
          throw new Error('Failed to read patent document during transition');
        }
        await initializeNoveltyAgent(patentDoc.contents);
        console.log('🔄 Novelty agent initialized with patent document');
      }
    } else {
      response = await invokeNoveltyAgent(userMessage);
      console.log('🔍 [NoveltyOrchestrator] response', response);
    }

    return response;
  } catch (error) {
    console.error('❌ [PatentOrchestrator] Error:', error);
    throw error;
  }
}

// Reset both agents and return to background phase
export function resetPatentThread() {
  console.log('🔄 [PatentOrchestrator] Resetting patent thread');
  resetBackgroundThread();
  resetNoveltyThread();
  currentAgent = 'background';
}

// Handle image loading and sending
export async function sendImageToPatentAgent(
  imagePath: string,
  description: string,
  isCodeOrDiagram: boolean
): Promise<OrchestratorResponse> {
  console.log('🖼️ [PatentOrchestrator] Sending image to', currentAgent, 'agent');
  try {
    if (currentAgent === 'background') {
      return await sendImageToBackgroundAgent(imagePath, description, isCodeOrDiagram);
    } else {
      return await sendImageToNoveltyAgent(imagePath, description, isCodeOrDiagram);
    }
  } catch (error) {
    console.error('❌ [PatentOrchestrator] Error sending image:', error);
    throw error;
  }
}
