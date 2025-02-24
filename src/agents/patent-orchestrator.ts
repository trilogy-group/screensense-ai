import { BaseMessage } from '@langchain/core/messages';
import { ActiveAgent, OrchestratorResponse } from '../types/agent-types';
import {
  initializeReconAgent,
  invokeReconAgent,
  resetReconThread,
  sendImageToReconAgent,
} from './recon-orchestrator';
import {
  initializeNoveltyAgent,
  invokeNoveltyAgent,
  sendImageToNoveltyAgent,
} from './novelty-orchestrator';
const { ipcRenderer } = window.require('electron');

// Add types for tool responses
let currentAgent: ActiveAgent = 'recon';

// Initialize the orchestrator
export async function initializePatentAgent() {
  resetPatentThread();
  console.log('🚀 Initializing patent orchestrator');
  await initializeReconAgent();
}

// Initialize when module loads
initializePatentAgent().catch(error => {
  console.error('❌ Failed to initialize patent agent:', error);
});

export async function invokePatentAgent(
  userMessage: string,
  isNewPatent: boolean = false
): Promise<OrchestratorResponse> {
  if (!userMessage || userMessage.trim() === '') {
    throw new Error('User message cannot be empty');
  }

  if (isNewPatent) resetPatentThread();

  console.log('📨 [PatentOrchestrator] Message preview:', userMessage.slice(0, 100) + '...');
  console.log('🤖 Current agent:', currentAgent);

  try {
    let response;
    if (currentAgent === 'recon') {
      response = await invokeReconAgent(userMessage, isNewPatent);

      // Debug tool calls
      console.log('🔍 [ReconOrchestrator] response', response);

      if (response.switchAgent) {
        console.log('🔄 Transitioning from recon to novelty agent');

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

// Reset both agents and return to recon phase
export function resetPatentThread() {
  console.log('🔄 [PatentOrchestrator] Resetting patent thread');
  resetReconThread();
  currentAgent = 'recon';
}

// Handle image loading and sending
export async function sendImageToPatentAgent(
  imagePath: string,
  description: string,
  isCodeOrDiagram: boolean
): Promise<OrchestratorResponse> {
  console.log('🖼️ [PatentOrchestrator] Sending image to', currentAgent, 'agent');
  try {
    if (currentAgent === 'recon') {
      return await sendImageToReconAgent(imagePath, description, isCodeOrDiagram);
    } else {
      return await sendImageToNoveltyAgent(imagePath, description, isCodeOrDiagram);
    }
  } catch (error) {
    console.error('❌ [PatentOrchestrator] Error sending image:', error);
    throw error;
  }
}
