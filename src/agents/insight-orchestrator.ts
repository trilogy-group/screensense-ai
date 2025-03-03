import { ActiveAgent, OrchestratorResponse } from '../types/agent-types';
import { tool } from '@langchain/core/tools';
import { MemorySaver } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod';

const { ipcRenderer } = window.require('electron');

// Type definitions
interface ReplyToUserParams {
  content: string;
}

interface AskNextQuestionParams {
  question: string;
}

interface AddInsightEntryParams {
  content: string;
  section: string;
}

interface ActionStep {
  action: {
    tool: string;
  };
  observation: any;
}

interface AgentResponse {
  messages: any[];
  intermediateSteps?: ActionStep[];
}

export interface InsightResponse extends OrchestratorResponse {
  switchPhase: boolean;
}

// State management
let currentThreadId: string | null = null;
let insightAgent: any = null;
let switchPhase = false;

// Tool definitions
const replyToUser = tool(
  async ({ content }: ReplyToUserParams) => {
    console.log('💬 [InsightAgent:replyToUser] Called with content length:', content.length);
    try {
      ipcRenderer.send('send-gemini-message', {
        message: `The insight expert has replied, tell the user this out loud: ${content}`,
      });
      return {
        success: true,
        message: 'Message sent to user successfully',
      };
    } catch (error) {
      console.error('❌ [InsightAgent:replyToUser] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error sending message',
      };
    }
  },
  {
    name: 'reply_to_user',
    description: 'Sends your reply to the user',
    schema: z.object({
      content: z.string().describe('The message content to send to the user'),
    }),
  }
);

const askNextQuestion = tool(
  async ({ question }: AskNextQuestionParams) => {
    console.log('❓ [InsightAgent:askNextQuestion] Called with question length:', question.length);
    try {
      await ipcRenderer.send('send-gemini-message', {
        message: `The insight expert would like to ask you: ${question}`,
      });
      return {
        success: true,
        message: 'Question sent successfully',
      };
    } catch (error) {
      console.error('❌ [InsightAgent:askNextQuestion] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error sending question',
      };
    }
  },
  {
    name: 'ask_next_question',
    description: 'Asks the next question to the user',
    schema: z.object({
      question: z.string().describe('The question to ask the user'),
    }),
  }
);

const addInsightEntry = tool(
  async ({ content, section }: AddInsightEntryParams) => {
    console.log('📝 [InsightAgent:addInsightEntry] Adding content to section:', section);
    try {
      await ipcRenderer.invoke('add_insight_entry', {
        content,
        section,
      });
      return {
        success: true,
        message: 'Content added successfully',
      };
    } catch (error) {
      console.error('❌ [InsightAgent:addInsightEntry] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error adding content',
      };
    }
  },
  {
    name: 'add_insight_entry',
    description: 'Adds content to a specific section of the insight document',
    schema: z.object({
      content: z.string().describe('The content to add'),
      section: z.string().describe('The section to add the content to'),
    }),
  }
);

const insightComplete = tool(
  async () => {
    console.log('🎯 [InsightAgent:insightComplete] Completing insight documentation');
    try {
      switchPhase = true;
      await ipcRenderer.send('send-gemini-message', {
        message:
          'Say this out loud to the user: "Great! I think we have gathered enough information about your experience. Let me organize this into a clear insight that others can learn from."',
      });

      await ipcRenderer.invoke('display_insight');

      return {
        success: true,
        message: 'Insight documentation phase completed',
      };
    } catch (error) {
      console.error('❌ [InsightAgent:insightComplete] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error completing insight phase',
      };
    }
  },
  {
    name: 'insight_complete',
    description: 'Marks the completion of the insight gathering phase',
    schema: z.object({}),
    returnDirect: true,
  }
);

// Define all tools available to the agent
const tools = [askNextQuestion, replyToUser, addInsightEntry, insightComplete];

// Initialize the agent
export async function initializeInsightAgent() {
  const model = new ChatAnthropic({
    modelName: 'claude-3-opus-20240229',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });
  
  insightAgent = createReactAgent({
    llm: model,
    tools,
    checkpointSaver: new MemorySaver(),
  });
  console.log('✅ Insight agent initialized');
}

export async function invokeInsightAgent(
  userMessage: string,
  isNewSession: boolean = false
): Promise<InsightResponse> {
  if (isNewSession) {
    resetInsightThread();
    await initializeInsightAgent();
    switchPhase = false;
  }

  if (!insightAgent) {
    throw new Error('Insight agent not initialized');
  }

  if (!userMessage || userMessage.trim() === '') {
    throw new Error('User message cannot be empty');
  }

  try {
    const isNewThread = !currentThreadId;
    if (!currentThreadId) {
      currentThreadId = `insight_${Date.now()}`;
      console.log('🆕 [invokeInsightAgent] Creating new thread:', currentThreadId);
    }

    const systemMessage = {
      role: 'system',
      content: `You are an expert insight discovery assistant. Your goal is to help users extract valuable insights from their daily work experiences through natural conversation. You should guide them to reflect on their problem-solving experiences and help them articulate their learnings in a way that's valuable for others.

1. CONVERSATION APPROACH
- Keep the tone casual and friendly, like a coffee chat with a colleague
- Show genuine interest in their experiences
- Ask exactly ONE question at a time, based on expert guidance
- Let the conversation flow naturally while steering towards insight discovery
- Maintain a seamless experience - never reveal the orchestration happening behind the scenes

2. INSIGHT DISCOVERY FOCUS
Look for experiences where the user:
- Solved an interesting problem
- Found a creative solution
- Learned something unexpected
- Discovered a better way of doing something
- Overcame a challenge
- Made an improvement to existing processes/code
- Found a non-obvious root cause
- Created a useful workaround

3. CONVERSATION GUIDELINES
- Start with casual, open-ended questions about their day
- Show genuine curiosity about their work
- Use natural follow-ups to explore interesting points
- Let the expert guide the conversation direction through ask_next_question
- Keep the tone informal and collegial throughout
- Use conversational transitions to maintain flow

4. INSIGHT DOCUMENTATION
When the expert identifies a valuable insight:
- Use add_insight_entry to document key points in appropriate sections:
  - Context: Background and situation
  - Problem: The challenge or issue faced
  - Solution: How it was solved
  - Impact: Results and benefits
  - Learnings: Key takeaways and advice
- Capture specific examples, code snippets, or screenshots that illustrate the insight
- Verify the accuracy of documented information with the user naturally within the conversation

5. COMPLETION CRITERIA
An insight is ready for completion when you have:
- Clear understanding of the context and problem
- Detailed explanation of the solution
- Concrete impact or results
- Actionable learnings others can apply
- User verification of accuracy

6. TOOL USAGE
- Use ask_next_question to receive expert guidance on what to ask next
- Use add_insight_entry to document key information as directed by the expert
- Use insight_complete when the expert indicates sufficient information gathered
- Use reply_to_user to maintain natural conversation flow

Remember: Focus on having a genuine, engaging conversation while letting the expert orchestrate the insight extraction process behind the scenes.`
    };

    const userMsg = {
      role: 'user',
      content: userMessage.trim(),
    };

    let messages;
    if (isNewThread) {
      messages = [systemMessage, userMsg];
    } else {
      messages = [userMsg];
    }

    const response = await insightAgent.invoke(
      { messages: messages },
      { configurable: { thread_id: currentThreadId } }
    );

    // Extract tool calls from the response
    const toolCalls = response.intermediateSteps?.map((step: ActionStep) => ({
      name: step.action.tool,
      response: { output: step.observation },
    })) || [];

    console.log('✅ [invokeInsightAgent] Response received:', {
      threadId: currentThreadId,
      isNewThread,
      numMessages: response.messages.length,
      lastMessageLength: response.messages.at(-1)?.content?.toString().length,
      numToolCalls: toolCalls.length,
      toolCallTypes: toolCalls.map((t: { name: string }) => t.name),
    });

    return {
      messages: response.messages,
      toolCalls,
      switchPhase,
    };
  } catch (error) {
    console.error('❌ [invokeInsightAgent] Error:', error);
    if (!currentThreadId) {
      currentThreadId = null;
    }
    throw error;
  }
}

// Reset the agent and return to initial phase
export function resetInsightThread() {
  console.log('🔄 [InsightAgent] Resetting insight thread');
  currentThreadId = null;
  switchPhase = false;
}

export async function sendImageToInsightAgent(
  imagePath: string,
  description: string,
  context: string
): Promise<OrchestratorResponse> {
  if (!insightAgent) {
    throw new Error('Insight agent not initialized');
  }

  try {
    const imageData = await ipcRenderer.invoke('read_insight_image', imagePath);
    if (!imageData.success) {
      throw new Error(imageData.error || 'Failed to read image file');
    }

    const base64Image = imageData.data;
    const ext = imagePath.split('.').pop()?.toLowerCase() || 'png';
    const mimeType =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'png'
          ? 'image/png'
          : ext === 'gif'
            ? 'image/gif'
            : ext === 'webp'
              ? 'image/webp'
              : 'image/png';

    const prompt = `The user shared a screenshot related to their experience.
The description of the screenshot is: ${description}
The context of the screenshot is: ${context}
It is located at: ${imagePath}
Analyze the image and description to better understand the user's experience and any potential insights.`;

    const userMsg = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: prompt,
        },
        {
          type: 'image_url',
          image_url: `data:${mimeType};base64,${base64Image}`,
        },
      ],
    };

    const response = await insightAgent.invoke(
      { messages: [userMsg] },
      { configurable: { thread_id: currentThreadId } }
    );

    const toolCalls =
      response.intermediateSteps?.map((step: ActionStep) => ({
        name: step.action.tool,
        response: { output: step.observation },
      })) || [];

    return {
      messages: response.messages,
      toolCalls,
      switchPhase,
    };
  } catch (error) {
    console.error('❌ [InsightAgent] Error sending image:', error);
    throw error;
  }
} 