import { tool } from '@langchain/core/tools';
import { MemorySaver } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import { initializeModel, OrchestratorResponse } from '../types/agent-types';
const { ipcRenderer } = window.require('electron');

// Track the current novelty assessment session
let currentThreadId: string | null = null;

const askNextQuestion = tool(
  async ({ reason, question }) => {
    console.log('🔍 [NoveltyAgent:askNextQuestion] Called with:', { reason, question });

    ipcRenderer.send('send-gemini-message', {
      message: `The laywer asked the following question, which you must ask out loud to the user: ${question}\n\nOnce the user answers the question, you MUST send the response to the laywer using the send_user_response tool.`,
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
    returnDirect: true,
  }
);

const addContent = tool(
  async ({ content, section }) => {
    console.log('📝 [addContent] Called with:', { section, contentLength: content.length });
    try {
      ipcRenderer.send('send-gemini-message', {
        message: `Say this out loud to the user: 'Please give me a few seconds to add the content to the document.'`,
      });
      const result = await ipcRenderer.invoke('add_content', { content, section });
      ipcRenderer.send('send-gemini-message', {
        message: `Say this out loud to the user: 'I've added the content to the document. Would you like to change anything? Or would you like to continue with the next novelty area?'`,
      });
      console.log('✅ [addContent] Content added successfully:', result);
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
    description:
      'Updates the markdown file with new content or modifications. Make sure to include all images, diagrams, and code snippets if any (you can embed them using markdown syntax).',
    schema: z.object({
      content: z.string().describe('The content to add to the document'),
      section: z.string().describe('The name of the section to add the content to'),
    }),
    returnDirect: true,
  }
);

// Define all tools available to the agent
const tools = [askNextQuestion, replyToUser, addContent];
let noveltyAgent: any = null;

// Initialize the agent
// console.log('🤖 Initializing Claude model for NoveltyAgent');
export async function initializeNoveltyAgent(patentDocument: string) {
  // console.log(patentDocument);
  let model = await initializeModel();
  // console.log('💾 Initializing memory saver for NoveltyAgent');

  let systemPrompt = `You are an expert in novelty assessment for patent applications. Your role is to identify, assess, and document the novel, patentable aspects of the invention.

**Workflow:**

1. **Initial Notification & Area Discovery:**
   - **Start by using the \`reply_to_user\` tool** to inform the user about the specific novelty area you will explore.
   - Ask focused, targeted questions to uncover one distinct novelty area at a time.

2. **Deep Documentation:**
   - Probe with follow-up questions to gather comprehensive details for the current novelty area.
   - Document the fully explored area using the \`add_content\` tool.
   - Make sure to include all images, diagrams, and code snippets if any (you can embed them using markdown syntax).
   - Confirm with the user that the documentation accurately reflects their innovation before proceeding.

3. **Section Organization:**
   - Organize documented content into:
     - **"What and How":** Technical implementation details and core mechanisms.
     - **"Implementation Details":** Specific configurations and technical choices.
     - **"Problems Solved":** How the novelty addresses existing challenges.
     - **"Alternatives":** Comparisons with existing solutions and advantages.

**Assessment Focus:**
- **Technical Uniqueness:** What makes the invention stand out?
- **Inventive Step Analysis:** Would experts find it obvious or surprising?
- **Combination of Known Elements:** Are existing technologies combined in an unconventional way?
- **Unexpected Results:** Are there non-obvious improvements in performance or usability?
- **Market Disruption Potential:** Could this change industry standards?

**Prior Art & Patentability:**
- Compare the invention with existing patents or solutions.
- Highlight missing aspects in prior art and demonstrate how the invention overcomes them.
- Reframe non-novel aspects into patentable claims, exploring adjacent innovations if necessary.

**Guidelines:**
- Use clear, precise technical language.
- **Always use the \`reply_to_user\` tool to notify the user of the current novelty area before probing.**
- Ask one question at a time; follow up as needed.
- Fully document each novelty area and confirm accuracy before moving to the next.
- End the assessment by informing the user that the evaluation is complete.

**Current Patent Document:**
${patentDocument}

Focus your questions on uncovering novel aspects not yet documented or areas needing further detail for patentability.
`;
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
    content: `Plase start by informing the user about the specific novelty area you will explore.`,
  };
  currentThreadId = `novelty_${Date.now()}`;
  await noveltyAgent.invoke(
    { messages: [systemMessage, userMessage] },
    { configurable: { thread_id: currentThreadId } }
  );

  console.log('✅ Novelty agent initialized');
}
export async function invokeNoveltyAgent(userMessage: string): Promise<OrchestratorResponse> {
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

    // console.log('Messages:', JSON.stringify(response.messages, null, 2));

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
  context: string,
  isCodeOrDiagram: boolean
): Promise<OrchestratorResponse> {
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
The context of the screenshot is: ${context}
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
