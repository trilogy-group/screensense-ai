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
    description: 'Asks the user the next question to fill the patent document.',
    schema: z.object({
      reason: z
        .string()
        .describe('Explanation of why you think the question is required to be asked to the user'),
      question: z.string().describe('The question to ask the user'),
    }),
    returnDirect: true,
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

const markAsCompleted = tool(
  async () => {
    console.log('🏁 [markAsCompleted] Patent documentation completed');
    // Send completion message via IPC
    ipcRenderer.send('patent-question', {
      question:
        "The patent documentation is now complete. I've reviewed all sections and confirmed that we have documented your invention thoroughly.",
      reason:
        'The patent lawyer has determined that all necessary information has been captured and properly documented.',
    });
    console.log('✅ [markAsCompleted] Completion message sent via IPC');
    return { success: true };
  },
  {
    name: 'mark_as_completed',
    description: 'Marks the patent document as completed',
    schema: z.object({}),
    returnDirect: true,
  }
);

// Define all tools available to the agent
const tools = [askNextQuestion, addContent, readPatent, markAsCompleted];

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
      //   console.log('🆕 [invokePatentAgent] Creating new thread:', currentThreadId);
    } else {
      //   console.log('🔄 [invokePatentAgent] Continuing thread:', currentThreadId);
    }

    const systemMessage = {
      role: 'system',
      content: `You are an expert patent documentation assistant. Your role is to help users document their inventions through a structured conversation.
Key Responsibilities:
1. Guide users through documenting their invention step by step
2. Ask relevant follow-up questions to gather complete information
3. Ensure all critical aspects of the invention are documented
4. Maintain a professional and thorough approach
Process:
1. You can make use of the read_patent tool to read the current patent document, and a checklist of what all information is required to be documented
2. Use ask_next_question to ask the user the next question to fill the patent document, and then wait for the user's response. This will be sent as a new message to you.
   - Make sure to add one question at a time, so as not to overwhelm the user.
3. Once the user responds to the question, use add_content to add the user's response to the patent document
   - You must make sure to call the add_content tool every single time you receive information from the user.
   - Make sure to use language that is appropriate for a patent document. Be thorough and detailed, but do not make up any information. You are allowed to rephrase the user's response to make it more patent-friendly, but do not add any new information.
   - If the content includes an image with the path, pass on the image description and path to the add_content tool
4. After adding the content, determine the next question to ask the user, or if you feel all the information has been gathered, use the mark_as_completed tool
Remember:
- Be thorough but efficient in gathering information
- Never make up information - only use what the user provides, as making up information could create an invalid patent document
- Ask clarifying questions when responses are unclear
- Help users articulate technical details clearly
- Ensure all critical patent sections are completed
- Guide users to provide sufficient detail for each section`,
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
