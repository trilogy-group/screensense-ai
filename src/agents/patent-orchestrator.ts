import { ActiveAgent, OrchestratorResponse } from '../types/agent-types';
import {
  initializeNoveltyAgent,
  invokeNoveltyAgent,
  sendImageToNoveltyAgent,
} from './novelty-orchestrator';
import { invokeReconAgent, sendImageToReconAgent } from './recon-orchestrator';
const { ipcRenderer } = window.require('electron');

// Add types for tool responses
let currentAgent: ActiveAgent = 'recon';

export async function invokePatentAgent(
  userMessage: string,
  isNewPatent: boolean = false,
  isResume: boolean = false
): Promise<OrchestratorResponse | null> {
  if (!userMessage || userMessage.trim() === '') {
    throw new Error('User message cannot be empty');
  }

  if (isNewPatent || isResume) resetPatentThread();

  console.log('📨 [PatentOrchestrator] Message preview:', userMessage.slice(0, 100) + '...');
  console.log('🤖 Current agent:', currentAgent);

  try {
    let response;
    if (isResume) {
      // If the patent doc is non-empty, initialize the novelty agent
      const patentDoc = await ipcRenderer.invoke('read_patent');
      if (patentDoc.success && patentDoc.contents) {
        currentAgent = 'novelty';
        await initializeNoveltyAgent(patentDoc.contents);
        response = await invokeNoveltyAgent(
          `The user wants to continue documenting their invention.`
        );
      } else {
        ipcRenderer.send('send-gemini-message', {
          message: `Tell the user this out loud: 'I couldn't find any existing patent session. Would you like to start a new one?'`,
        });
        return null;
      }
    } else if (currentAgent === 'recon') {
      response = await invokeReconAgent(userMessage, isNewPatent);

      // Debug tool calls
      // console.log('🔍 [ReconOrchestrator] response', response);

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
  currentAgent = 'recon';
}

// Handle image loading and sending
export async function sendImageToPatentAgent(
  imagePath: string,
  description: string,
  context: string,
  isCodeOrDiagram: boolean
): Promise<OrchestratorResponse> {
  console.log('🖼️ [PatentOrchestrator] Sending image to', currentAgent, 'agent');
  try {
    if (currentAgent === 'recon') {
      return await sendImageToReconAgent(imagePath, description, context, isCodeOrDiagram);
    } else {
      return await sendImageToNoveltyAgent(imagePath, description, context, isCodeOrDiagram);
    }
  } catch (error) {
    console.error('❌ [PatentOrchestrator] Error sending image:', error);
    throw error;
  }
}
