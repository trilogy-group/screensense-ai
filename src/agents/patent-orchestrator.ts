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

interface ThreadState {
  messages?: Array<{
    role: string;
    content: string | Array<any>; // Allow array content for assistant messages
  }>;
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
  }
);

const addContent = tool(
  async ({ content, section }) => {
    console.log('📝 [addContent] Called with:', { section, contentLength: content.length });
    try {
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
      return result;
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
    // checkpointSaver: checkpointer,
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
3. Once the user responds to the question, use add_content to add the user's response to the patent document
   - Make sure to use language that is appropriate for a patent document. Be thorough and detailed, but do not make up any information. You should only improve the information provided by the user, not add any new information.
   - If the content includes an image with the path, pass on the image description and path to the add_content tool
4. After adding the content, determine the next question to ask the user, or if you feel all the information has been gathered, use the mark_as_completed tool
Remember:
- Be thorough but efficient in gathering information
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

    const response = await patentAgent.invoke(
      { messages: messages },
      { configurable: { thread_id: currentThreadId } }
    );

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

    // console.log(`The last message is ${JSON.stringify(response.messages.at(-1), null, 2)}`);
    // console.log(`The messages are ${JSON.stringify(response.messages, null, 2)}`);

    // console.log(`Received messages: ${JSON.stringify(response.messages, null, 2)}`);

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
