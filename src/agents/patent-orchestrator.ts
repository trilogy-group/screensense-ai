import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const askNextQuestion = tool(
  async ({ reason, question }) => {
    // This will be replaced with actual IPC call later
    console.log(`Asking question: ${question} because ${reason}`);
    return { success: true, question: 'What problem does your invention solve?' };
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
    // This will be replaced with actual IPC call later
    return { success: true, message: `Added content to section ${section}` };
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
    // This will be replaced with actual IPC call later
    return { success: true, contents: 'Patent document contents...' };
  },
  {
    name: 'read_patent',
    description: 'Reads the current patent document and the checklist',
    schema: z.object({}),
  }
);

const markAsCompleted = tool(
  async () => {
    // This will be replaced with actual IPC call later
    return { success: true, message: `The patent document has been completed` };
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
const model = new ChatAnthropic({
  modelName: 'claude-3-5-sonnet-20241022',
  temperature: 0,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  maxTokens: 8192,
});

// Initialize memory to persist state between graph runs
const checkpointer = new MemorySaver();

// Create the patent agent
export const patentAgent = createReactAgent({
  llm: model,
  tools,
  checkpointSaver: checkpointer,
});

export async function invokePatentAgent(userMessage: string, threadId: string = 'patent_1') {
  return await patentAgent.invoke(
    {
      messages: [
        {
          role: 'system',
          content: `You are an expert patent documentation assistant. Your role is to help users document their inventions through a structured conversation.

Key Responsibilities:
1. Guide users through documenting their invention step by step
2. Ask relevant follow-up questions to gather complete information
3. Ensure all critical aspects of the invention are documented
4. Maintain a professional and thorough approach

Process:
1. You can make use of the read_patent tool to read the current patent document, and a checklist of what all information is required to be documented
2. Use ask_next_question to ask the user the next question to fill the patent document
3. Once the user responds to the question, use add_content to add the user's response to the patent document
   - Make sure to use language that is appropriate for a patent document. Be thorough and detailed.
   - If the content includes an image with the path, pass on the image description and path to the add_content tool
4. After adding the content, determine the next question to ask the user, or if you feel all the information has been gathered, use the mark_as_completed tool

Remember:
- Be thorough but efficient in gathering information
- Ask clarifying questions when responses are unclear
- Help users articulate technical details clearly
- Ensure all critical patent sections are completed
- Guide users to provide sufficient detail for each section`,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
    },
    { configurable: { thread_id: threadId } }
  );
}
