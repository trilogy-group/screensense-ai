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

interface OrchestratorResponse {
  messages: BaseMessage[];
  toolCalls?: ToolResponse[];
}

// Track the current patent session
let currentThreadId: string | null = null;

const askNextQuestion = tool(
  async ({ reason, question }) => {
    console.log('🔍 [askNextQuestion] Called with:', { reason, question });
    // Send the question via IPC
    ipcRenderer.send('patent-question', { question, reason });
    // console.log('✅ [askNextQuestion] Question sent via IPC');
    return {
      success: true,
      message:
        'The question has been asked to the user, you will receive a response shortly. End your current turn, and continue when you receive a response from the user.',
    };
  },
  {
    name: 'ask_next_question',
    description: 'Asks the user a single question to fill the patent document.',
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
    console.log('💬 [replyToUser] Called with content length:', content.length);
    try {
      ipcRenderer.send('send-gemini-message', {
        message: `The laywer has replied, tell the user this out loud: ${content}`,
      });
      return {
        success: true,
        message: 'Message sent to user successfully',
      };
    } catch (error) {
      console.error('❌ [replyToUser] Error:', error);
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
    console.log('📝 [addContent] Called with:', { section, contentLength: content.length });
    try {
      ipcRenderer.send('send-gemini-message', {
        message: `Tell the user this: 'Please give me a few seconds to add the content to the document.`,
      });
      const result = await ipcRenderer.invoke('add_content', { content, section });
      //   console.log('✅ [addContent] Content added successfully:', result);
      return result;
    } catch (error) {
      console.error('❌ [addContent] Error:', error);
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
    // returnDirect: true,
  }
);

const readPatent = tool(
  async () => {
    console.log('📖 [readPatent] Reading current patent document');
    try {
      // The checklist will be included in the response from main.ts
      const result = await ipcRenderer.invoke('read_patent');
      //   console.log('✅ [readPatent] Document read successfully:', {
      //     success: result.success,
      //     contentLength: result.contents?.length,
      //     numSections: result.checklist?.length,
      //   });
      return {
        success: result.success,
        message: `Contents:\n${result.contents}\n\nChecklist:\n${JSON.stringify(result.checklist)}\n\nNow ask the user the first question to fill the patent document.`,
      };
    } catch (error) {
      console.error('❌ [readPatent] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error reading patent',
      };
    }
  },
  {
    name: 'read_patent',
    description:
      'Reads the current patent document and returns both the document contents and a checklist of required sections',
    schema: z.object({}),
    // returnDirect: true,
  }
);

const reconComplete = tool(
  async ({ summary }) => {
    console.log('🎯 [reconComplete] Called with summary length:', summary.length);
    try {
      // First, notify the user that recon is complete
      await ipcRenderer.send('send-gemini-message', {
        message:
          'The initial discovery phase is complete. I will now start documenting what we have discussed.',
      });

      await ipcRenderer.invoke('display_patent');

      // Then add the gathered information as background context
      await ipcRenderer.invoke('add_content', {
        content: summary,
        section: 'Background',
      });

      return {
        success: true,
        message:
          'Recon phase completed and initial documentation added. Proceeding to detailed documentation phase.',
      };
    } catch (error) {
      console.error('❌ [reconComplete] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error completing recon phase',
      };
    }
  },
  {
    name: 'recon_complete',
    description:
      'Marks the completion of the reconnaissance phase and adds gathered information as background context.',
    schema: z.object({
      summary: z
        .string()
        .describe('A comprehensive summary of the innovation discovered during the recon phase'),
    }),
  }
);

// Define all tools available to the agent
const tools = [askNextQuestion, addContent, readPatent, replyToUser, reconComplete];

// Initialize the model
console.log('🤖 Initializing Claude model');
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

// Initialize memory to persist state between graph runs
// Create the patent agent
console.log(
  '🎯 Creating patent agent with tools:',
  tools.map(t => t.name)
);

let patentAgent: any = null;
let checkpointer: MemorySaver;

// Initialize the agent
export async function initializePatentAgent() {
  await initializeModel();
  console.log('💾 Initializing memory saver');
  checkpointer = new MemorySaver();
  patentAgent = createReactAgent({
    llm: model,
    tools,
    checkpointSaver: checkpointer,
  });
  console.log('✅ Patent agent initialized');
}

// Initialize when module loads
initializePatentAgent().catch(error => {
  console.error('❌ Failed to initialize patent agent:', error);
});

export async function invokePatentAgent(userMessage: string): Promise<OrchestratorResponse> {
  if (!patentAgent) {
    throw new Error('Patent agent not initialized');
  }

  if (!userMessage || userMessage.trim() === '') {
    throw new Error('User message cannot be empty');
  }

  //   console.log('🚀 [invokePatentAgent] Called with message length:', userMessage.length);
  console.log('📨 [invokePatentAgent] Message preview:', userMessage.slice(0, 100) + '...');

  try {
    // If this is the first message, set up the thread with system instructions
    const isNewThread = !currentThreadId;
    if (!currentThreadId) {
      currentThreadId = `patent_${Date.now()}`;
      console.log('🆕 [invokePatentAgent] Creating new thread:', currentThreadId);
    } else {
      //   console.log('🔄 [invokePatentAgent] Continuing thread:', currentThreadId);
    }

    const systemMessage = {
      role: 'system',
      content: `You are an expert innovation discovery and patent documentation assistant. Your role is to help developers uncover and document the unique aspects of their work through natural, organic conversation. (Keep in mind that many developers may not immediately recognize the novel elements of their work.)

Conversation Guidelines:
- Let the discussion flow naturally and follow the developer’s lead.
- Listen for hints of innovation (e.g., problems solved, technical challenges, unique approaches, unexpected use cases, performance improvements, novel technology combinations, UX innovations).
- Break down complex topics into individual, sequential questions.

Reconnaissance Completion:
- End the discovery phase when you clearly understand what makes their work unique, the developer has fully explained their innovation, relevant demonstrations have been provided, and the conversation has naturally deepened.
- Then use recon_complete to summarize:
   - The essence of their work
   - What makes it unique
   - Key technical achievements
   - Any visual demonstrations shared
   - Areas most important to the developer

CRUCIAL RULES:
1. ONE QUESTION RULE:
   - Ask exactly ONE question at a time.
   - NEVER combine multiple questions (e.g., ask “How does your system work?” instead of “How does your system work and what makes it unique?”).
   - After receiving an answer, ask follow-up questions one at a time.

2. SCREEN SHARING REQUESTS:
   - When the conversation covers user interfaces/UX, system architecture/diagrams, workflows, technical implementations, visual design, or performance metrics/dashboards, ask: “Would you be willing to share your screen to show me what you just described?”

Tools:
- Use ask_next_question for each single, focused query.
- Use recon_complete to summarize findings when the conversation is complete.
- Use reply_to_user to maintain conversational flow.`,
    };

    const userMsg = {
      role: 'user',
      content: userMessage.trim(),
    };

    // Construct messages array with validation
    let messages;
    if (isNewThread) {
      messages = [systemMessage, userMsg];
    } else {
      messages = [userMsg];
    }

    // console.log(`Checkpointer is ${JSON.stringify(checkpointer)}`);

    const response = await patentAgent.invoke(
      { messages: messages },
      { configurable: { thread_id: currentThreadId } }
    );

    // console.log(
    //   `Received ${response.messages.length} messages from patent agent:\n${response.messages
    //     .map((m: any) => `=====\n${m.content}\n=====`)
    //     .join('\n')}`
    // );

    // Access the structured response
    const structuredResponse = response.structuredResponse;
    const toolCalls = (typeof structuredResponse === 'function' ? structuredResponse() : {}) || {};

    console.log('✅ [invokePatentAgent] Response received:', {
      threadId: currentThreadId,
      isNewThread,
      numMessages: response.messages.length,
      lastMessageLength: response.messages.at(-1)?.content?.toString().length,
      numToolCalls: Object.keys(toolCalls).length,
      toolCallTypes: Object.keys(toolCalls),
    });

    return {
      messages: response.messages,
      toolCalls: Object.entries(toolCalls).map(([name, response]) => ({
        name,
        response: { output: response },
      })),
    };
  } catch (error) {
    console.error('❌ [invokePatentAgent] Error:', error);
    // Reset thread ID if there's an error during first message
    if (!currentThreadId) {
      currentThreadId = null;
    }
    throw error;
  }
}

// Add function to reset thread (e.g., when starting a new patent)
export function resetPatentThread() {
  console.log('🔄 [resetPatentThread] Resetting current thread');
  currentThreadId = null;
}

// New function to handle image loading and sending
export async function sendImageToPatentAgent(
  imagePath: string,
  description: string
): Promise<OrchestratorResponse> {
  if (!patentAgent) {
    throw new Error('Patent agent not initialized');
  }

  //   console.log(`Received image path: ${imagePath} with description: ${description}`);

  try {
    // Convert relative path to absolute path and read the image
    const imageData = await ipcRenderer.invoke('read_patent_image', imagePath);
    if (!imageData.success) {
      throw new Error(imageData.error || 'Failed to read image file');
    }

    const base64Image = imageData.data;
    // Determine mime type from file extension
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

    // Create message with both text and image
    const userMsg = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `The user shared a screenshot of their invention.
The description of the screenshot is: ${description}
It is located at: ${imagePath}
Analyze the image and the description, and then insert the image and any relevant information into the patent document.`,
        },
        {
          type: 'image_url',
          image_url: `data:${mimeType};base64,${base64Image}`,
        },
      ],
    };

    // console.log(`Image url is ${userMsg.content[1].image_url}`);

    // Use patentAgent.invoke to maintain thread context
    const response = await patentAgent.invoke(
      { messages: [userMsg] },
      { configurable: { thread_id: currentThreadId } }
    );

    // Access the structured response like in invokePatentAgent
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
    console.error('❌ [sendImageToPatentAgent] Error:', error);
    throw error;
  }
}
