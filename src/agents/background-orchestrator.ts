import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { tool } from '@langchain/core/tools';
import { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
const { ipcRenderer } = window.require('electron');

// Add types for tool responses
interface ToolResponse {
  name: string;
  response: {
    output: any;
  };
}

interface BackgroundResponse {
  messages: BaseMessage[];
  toolCalls?: ToolResponse[];
  switch_agent?: boolean;
}

// Add types for intermediate steps
interface ActionStep {
  action: {
    tool: string;
    toolInput: any;
  };
  observation: any;
}

interface AgentResponse {
  messages: BaseMessage[];
  intermediateSteps?: ActionStep[];
}

// Track the current background session
let currentThreadId_background: string | null = null;
let switch_agent: boolean = false;

const askNextQuestion = tool(
  async ({ reason, question }) => {
    console.log('🔍 [BackgroundAgent:askNextQuestion] Called with:', { reason, question });
    ipcRenderer.send('patent-question', { question, reason });
    return {
      success: true,
      message:
        'The question has been asked to the user, you will receive a response shortly. End your current turn, and continue when you receive a response from the user.',
    };
  },
  {
    name: 'ask_next_question',
    description: 'Asks the user a single question to understand their invention.',
    schema: z.object({
      reason: z
        .string()
        .describe('Explanation of why you think the question is required to be asked to the user'),
      question: z.string().describe('The single question to ask the user'),
    }),
    returnDirect: true,
  }
);

const replyToUser = tool(
  async ({ content }) => {
    console.log('💬 [BackgroundAgent:replyToUser] Called with content length:', content.length);
    try {
      ipcRenderer.send('send-gemini-message', {
        message: `The patent lawyer has replied, tell the user this out loud: ${content}`,
      });
      return {
        success: true,
        message: 'Message sent to user successfully',
      };
    } catch (error) {
      console.error('❌ [BackgroundAgent:replyToUser] Error:', error);
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

const addContent = tool(
  async ({ content, section }) => {
    console.log('📝 [BackgroundAgent:addContent] Called with:', { section, contentLength: content.length });
    try {
      ipcRenderer.send('send-gemini-message', {
        message: `Tell the user this: 'Please give me a few seconds to add the content to the document.'`,
      });
      const result = await ipcRenderer.invoke('add_content', { content, section });
      return result;
    } catch (error) {
      console.error('❌ [BackgroundAgent:addContent] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error adding content',
      };
    }
  },
  {
    name: 'add_content',
    description: 'Updates the markdown file with new content or modifications.',
    schema: z.object({
      content: z.string().describe('The content to add to the document'),
      section: z.string().describe('The name of the section to add the content to'),
    }),
  }
);

const readPatent = tool(
  async () => {
    console.log('📖 [BackgroundAgent:readPatent] Reading current patent document');
    try {
      const result = await ipcRenderer.invoke('read_patent');
      return {
        success: result.success,
        message: `Contents:\n${result.contents}\n\nChecklist:\n${JSON.stringify(result.checklist)}\n\nNow ask the user the first question to understand their invention.`,
      };
    } catch (error) {
      console.error('❌ [BackgroundAgent:readPatent] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error reading patent',
      };
    }
  },
  {
    name: 'read_patent',
    description: 'Reads the current patent document and returns both the document contents and a checklist of required sections',
    schema: z.object({}),
  }
);

const reconComplete = tool(
  async ({ summary }) => {
    console.log('🎯 [BackgroundAgent:reconComplete] Called with summary length:', summary.length);
    try {
      await ipcRenderer.send('send-gemini-message', {
        message: 'The initial discovery phase is complete. I will now start documenting what we have discussed.',
      });

      await ipcRenderer.invoke('display_patent');

      await ipcRenderer.invoke('add_content', {
        content: summary,
        section: 'Background',
      });

      // Return a properly structured response
      const response = {
        success: true,
        message: 'Background phase completed. Ready to transition to novelty assessment.',
        shouldTransition: true,
      };
      switch_agent = true;
      console.log('🎯 [BackgroundAgent:reconComplete] Returning response:', response);
      return response;
    } catch (error) {
      console.error('❌ [BackgroundAgent:reconComplete] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error completing background phase',
      };
    }
  },
  {
    name: 'recon_complete',
    description: 'Marks the completion of the background phase and adds gathered information as background context.',
    schema: z.object({
      summary: z
        .string()
        .describe('A comprehensive summary of the innovation discovered during the background phase'),
    }),
    returnDirect: true,
  }
);

// Define all tools available to the agent
const tools = [askNextQuestion, addContent, readPatent, replyToUser, reconComplete];

// Initialize the model
console.log('🤖 Initializing Claude model for BackgroundAgent');
let model: ChatAnthropic;

// Initialize model with API key from main process
async function initializeModel() {
  const apiKey = await ipcRenderer.invoke('get-env', 'REACT_APP_ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('❌ Anthropic API key not found in environment variables');
    throw new Error('Anthropic API key not found');
  }
  console.log('✅ Got API key from main process');

  model = new ChatAnthropic({
    modelName: 'claude-3-5-sonnet-20241022',
    temperature: 0,
    anthropicApiKey: apiKey,
    maxTokens: 8192,
  });
}

let backgroundAgent: any = null;
let checkpointer_background: MemorySaver;

// Initialize the agent
export async function initializeBackgroundAgent() {
  await initializeModel();
  console.log('💾 Initializing memory saver for BackgroundAgent');
  checkpointer_background = new MemorySaver();
  backgroundAgent = createReactAgent({
    llm: model,
    tools,
    checkpointSaver: checkpointer_background,
  });
  console.log('✅ Background agent initialized');
}

export async function invokeBackgroundAgent(userMessage: string): Promise<BackgroundResponse> {
  if (!backgroundAgent) {
    throw new Error('Background agent not initialized');
  }

  if (!userMessage || userMessage.trim() === '') {
    throw new Error('User message cannot be empty');
  }

  console.log('📨 [invokeBackgroundAgent] Message preview:', userMessage.slice(0, 100) + '...');

  try {
    const isNewThread = !currentThreadId_background;
    if (!currentThreadId_background) {
      currentThreadId_background = `background_${Date.now()}`;
      console.log('🆕 [invokeBackgroundAgent] Creating new thread:', currentThreadId_background);
    }

    const systemMessage = {
      role: 'system',
      content: `You are an expert innovation discovery and patent documentation assistant. Your primary goal is to gain a deep, contextual understanding of the developer's invention to extract and document every unique, innovative aspect necessary for a robust patent application.

1. SINGLE-QUESTION RULE
Ask exactly ONE question at a time.
NEVER combine multiple questions. (e.g., Ask "How does your system work?" rather than "How does your system work and what makes it unique?")
After receiving an answer, ask sequential follow-up questions to progressively refine your understanding.

2. CONTEXTUAL UNDERSTANDING PRIORITY
Prioritize uncovering the full background and context of the invention before jumping into technical details.
Begin by understanding the problem being solved and the broader domain of the invention.
Ask about pain points, industry context, existing solutions, and limitations before delving into technical implementation.
Identify the developer's inspiration, motivations, and key differentiators of their approach.

3. SCREEN SHARING REQUESTS
When discussing user interfaces (UX), system architecture, workflows, technical implementations, visual design, or performance dashboards, ask:
"Would you be willing to share your screen to show me what you just described?"

4. NATURAL CONVERSATION FLOW
Follow the developer's lead and let the discussion flow naturally.
Actively listen for hints of innovation such as:
- Problems solved
- Technical challenges overcome
- Unique approaches
- Unexpected use cases
- Performance improvements
- Novel technology combinations
- UX innovations
Break down complex topics into clear, sequential questions.

5. BACKGROUND EXTRACTION PROCESS
Your objective is to fully understand the invention by gathering:
- The problem being solved
- Current solutions and their limitations
- Core innovative elements
- Technical implementation details
- Key differentiators

If the user shares visual demonstrations (screenshots, diagrams, etc.), pass:
- A detailed description of the shared image
- The file path to the image to ensure correct embedding in the patent document

6. TOOL USAGE
- Use ask_next_question for each focused, context-driven query
- Use recon_complete when you have gathered sufficient background information
- Use reply_to_user to maintain conversational flow

Remember to focus on gathering comprehensive background information before transitioning to novelty assessment.`,
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

    const response = (await backgroundAgent.invoke(
      { messages: messages },
      { configurable: { thread_id: currentThreadId_background } }
    )) as AgentResponse;

    // Debug the raw response
    console.log('🔍 [invokeBackgroundAgent] Raw response:', response);

    // Extract tool calls from the response
    const toolCalls = response.intermediateSteps?.map(step => ({
      name: step.action.tool,
      response: { output: step.observation }
    })) || [];

    console.log('🔍 [invokeBackgroundAgent] Tool calls:', toolCalls);

    console.log('✅ [invokeBackgroundAgent] Response received:', {
      threadId: currentThreadId_background,
      isNewThread,
      numMessages: response.messages.length,
      lastMessageLength: response.messages.at(-1)?.content?.toString().length,
      numToolCalls: toolCalls.length,
      toolCallTypes: toolCalls.map(t => t.name),
    });

    return {
      messages: response.messages,
      toolCalls: toolCalls,
      switch_agent: switch_agent,
    };
  } catch (error) {
    console.error('❌ [invokeBackgroundAgent] Error:', error);
    if (!currentThreadId_background) {
      currentThreadId_background = null;
    }
    throw error;
  }
}

export function resetBackgroundThread() {
  console.log('🔄 [resetBackgroundThread] Resetting current thread');
  currentThreadId_background = null;
}

export async function sendImageToBackgroundAgent(
  imagePath: string,
  description: string,
  isCodeOrDiagram: boolean
): Promise<BackgroundResponse> {
  if (!backgroundAgent) {
    throw new Error('Background agent not initialized');
  }

  try {
    const imageData = await ipcRenderer.invoke('read_patent_image', imagePath);
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

    let prompt = '';
    if (isCodeOrDiagram) {
      prompt = `The user has provided a screenshot containing code or a diagram for background understanding.
Follow these guidelines:
- Analyze the implementation or diagram for understanding the invention
- Identify key components and their relationships
- Understand the technical approach
- Document any unique aspects or innovations shown
The image is located at: ${imagePath}`;
    } else {
      prompt = `The user shared a screenshot related to their invention.
The description of the screenshot is: ${description}
It is located at: ${imagePath}
Analyze the image and description to better understand the invention.`;
    }

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

    const response = await backgroundAgent.invoke(
      { messages: [userMsg] },
      { configurable: { thread_id: currentThreadId_background } }
    );

    const structuredResponse = response.structuredResponse;
    const toolCalls = (typeof structuredResponse === 'function' ? structuredResponse() : {}) || {};

    return {
      messages: response.messages,
      toolCalls: Object.entries(toolCalls).map(([name, response]) => ({
        name,
        response: { output: response },
      })),
    };
  } catch (error) {
    console.error('❌ [sendImageToBackgroundAgent] Error:', error);
    throw error;
  }
} 