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

interface NoveltyResponse {
  messages: BaseMessage[];
  toolCalls?: ToolResponse[];
}

// Track the current novelty assessment session
let currentThreadId: string | null = null;

const askNextQuestion = tool(
  async ({ reason, question }) => {
    console.log('🔍 [NoveltyAgent:askNextQuestion] Called with:', { reason, question });

    ipcRenderer.send('send-gemini-message', {
      message: `The laywer asked the following question, which you must ask out loud to the user: ${question}\n\nOnce the user answers the question, send the response to the laywer using the send_user_response tool.`,
    });
    return {
      success: true,
      message:
        'The question has been asked to the user, you will receive a response shortly. End your current turn, and continue when you receive a response from the user.',
    };
  },
  {
    name: 'ask_next_question',
    description: 'Asks the user a single question to assess the novelty of their invention.',
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
    console.log('💬 [NoveltyAgent:replyToUser] Called with content length:', content.length);
    try {
      ipcRenderer.send('send-gemini-message', {
        message: `The lawyer has replied, tell the user this out loud: ${content}`,
      });
      return {
        success: true,
        message: 'Message sent to user successfully',
      };
    } catch (error) {
      console.error('❌ [NoveltyAgent:replyToUser] Error:', error);
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

// Define all tools available to the agent
const tools = [askNextQuestion, replyToUser, addContent];

// Initialize the model
console.log('🤖 Initializing Claude model for NoveltyAgent');
let model: ChatAnthropic;

// Initialize model with API key from main process
async function initializeModel() {
  const settings = await ipcRenderer.invoke('get-saved-settings');
  const apiKey = settings.anthropicApiKey;

  if (!apiKey) {
    console.error('❌ Anthropic API key not found in settings');
    throw new Error('Anthropic API key not found');
  }
  console.log('✅ Got API key from settings');

  model = new ChatAnthropic({
    modelName: 'claude-3-5-sonnet-20241022',
    temperature: 0,
    anthropicApiKey: apiKey,
    maxTokens: 8192,
  });
}
let noveltyAgent: any = null;

// Initialize the agent
export async function initializeNoveltyAgent(patentDocument?: string) {
  // console.log(patentDocument);
  await initializeModel();
  console.log('💾 Initializing memory saver for NoveltyAgent');

  let systemPrompt = `You are an expert in novelty assessment for patent applications. Your role is to systematically identify, assess, and document the novel and patentable aspects of the invention.

WORKFLOW:
1. Area Discovery
- Ask targeted questions to identify distinct areas of novelty
- Focus on one area at a time until fully understood
- Use the dimensions below to guide your exploration

2. Deep Documentation
For each identified area of novelty:
- Gather comprehensive details through focused questions
- Document the novelty thoroughly once you have sufficient information
- Use the add_content tool to add the documented novelty to the appropriate section
- Confirm with the user if the documentation captures their innovation accurately
- Move to the next area only after current area is fully documented

3. Section Organization
When documenting novelties, add them to these sections as appropriate:
- "What and How" - For technical implementation details and core mechanisms
- "Implementation Details" - For specific configurations and technical choices
- "Problems Solved" - For how the novelty addresses existing challenges
- "Alternatives" - For comparing with existing solutions and highlighting advantages

Assess the invention across multiple dimensions:
- Technical Uniqueness: What specific features or mechanisms differentiate this invention?
- Inventive Step Analysis: Would an expert in the field find this approach obvious or surprising?
- Combination of Known Elements: Are existing technologies being combined in an unconventional way?
- Unexpected Results: Does the invention lead to performance, efficiency, or usability improvements that are not obvious?
- Market Disruption Potential: How does this approach change industry standards or user expectations?

Prior Art Investigation:
- Identify competing solutions or patents and directly compare them
- Pinpoint the precise aspect that is missing in prior art
- If similar concepts exist, document how this invention overcomes their limitations

Strengthening Patentability
- Guide the user in reframing non-novel aspects into patentable claims.
- If novelty is weak, explore adjacent innovations that could enhance uniqueness.
- Identify broad vs. narrow claims, helping structure a robust patent strategy.

Guidelines for Documentation:
- Use clear, precise technical language suitable for patents
- Include specific implementation details and configurations
- Highlight the non-obvious aspects and technical advantages
- Document both the novel features and their benefits
- Structure content to support broad and narrow patent claims

Tool Usage:
- Use ask_next_question to gather information about each area of novelty
- Use add_content to document each fully explored novelty area
- Use reply_to_user to maintain conversational flow and confirm understanding

Asking Questions:
- Ask One Question at a Time. 
- Never combine multiple questions—keep each inquiry focused. 
- Use follow-up questions to refine and probe deeper.
- Adapt your questioning based on the user's responses.

Remember to:
1. Focus on one area of novelty at a time
2. Document each area thoroughly before moving to the next
3. Organize content into appropriate sections
4. Confirm accuracy with the user before proceeding
5. Maintain clear technical language throughout`;

  // Add patent document to system prompt if provided
  if (patentDocument) {
    systemPrompt += `\n\nCurrent Patent Document:\n${patentDocument}\n\nAnalyze the above patent document and focus your questions on uncovering novel aspects not yet documented or areas that need more detail to establish patentability.`;
  }
  // Create the agent with the system message
  noveltyAgent = createReactAgent({
    llm: model,
    tools,
    checkpointSaver: new MemorySaver(),
  });

  // Set the system message for the first message
  const systemMessage = {
    role: 'system',
    content: systemPrompt,
  };
  const userMessage = {
    role: 'user',
    content: `Plase start by asking your first question. And remember to ask question using the ask_next_question tool. Ask one question at a time`,
  };
  currentThreadId = `novelty_${Date.now()}`;
  await noveltyAgent.invoke(
    { messages: [systemMessage, userMessage] },
    { configurable: { thread_id: currentThreadId } }
  );

  console.log('✅ Novelty agent initialized');
}
export async function invokeNoveltyAgent(userMessage: string): Promise<NoveltyResponse> {
  if (!noveltyAgent) {
    throw new Error('Novelty agent not initialized');
  }

  if (!userMessage || userMessage.trim() === '') {
    throw new Error('User message cannot be empty');
  }

  console.log('📨 [invokeNoveltyAgent] Message preview:', userMessage.slice(0, 100) + '...');

  try {
    const userMsg = {
      role: 'user',
      content: userMessage.trim(),
    };

    let messages = [userMsg];

    const response = await noveltyAgent.invoke(
      { messages: messages },
      { configurable: { thread_id: currentThreadId } }
    );

    const structuredResponse = response.structuredResponse;
    const toolCalls = (typeof structuredResponse === 'function' ? structuredResponse() : {}) || {};

    console.log('✅ [invokeNoveltyAgent] Response received:', {
      threadId: currentThreadId,
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
    console.error('❌ [invokeNoveltyAgent] Error:', error);
    if (!currentThreadId) {
      currentThreadId = null;
    }
    throw error;
  }
}

export async function sendImageToNoveltyAgent(
  imagePath: string,
  description: string,
  isCodeOrDiagram: boolean
): Promise<NoveltyResponse> {
  if (!noveltyAgent) {
    throw new Error('Novelty agent not initialized');
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
      prompt = `The user has provided a screenshot containing code or a diagram.
Follow these guidelines:
- Analyze the technical implementation or diagram for unique aspects
- Identify any novel combinations or approaches
- Compare with known solutions in the field
- Assess patentability of the shown implementation
- Consider non-obviousness to experts in the field
The image is located at: ${imagePath}`;
    } else {
      prompt = `The user shared a screenshot related to their invention.
The description of the screenshot is: ${description}
It is located at: ${imagePath}
Analyze the image and description for novel aspects and patentability.`;
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

    const response = await noveltyAgent.invoke(
      { messages: [userMsg] },
      { configurable: { thread_id: currentThreadId } }
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
    console.error('❌ [sendImageToNoveltyAgent] Error:', error);
    throw error;
  }
}
