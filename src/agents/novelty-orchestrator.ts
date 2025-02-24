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
let currentThreadIdNovelty: string | null = null;

const askNextQuestion = tool(
    async ({ reason, question }) => {
        console.log('🔍 [NoveltyAgent:askNextQuestion] Called with:', { reason, question });

        ipcRenderer.send('patent-question', { question, reason });
        // const message = `The laywer asked the following question, which you must ask out loud to the user: ${question}\n\nOnce the user answers the question, send the response to the laywer using the send_user_response tool.`

        // ipcRenderer.send('send-gemini-message', { 
        //     message : message
        // });

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


const reconComplete = tool(
    async ({ summary }) => {
        console.log('🎯 [NoveltyAgent:reconComplete] Called with summary length:', summary.length);
        try {
            await ipcRenderer.send('send-gemini-message', {
                message: 'The initial discovery phase is complete. I will now start documenting what we have discussed.',
            });

            await ipcRenderer.invoke('display_patent');

            await ipcRenderer.invoke('add_content', {
                content: summary,
                section: 'Novelty',
            });

            return {
                success: true,
                message: 'Novelty phase completed. Ready to transition to next phase.',
                shouldTransition: true,
            };
        } catch (error) {
            console.error('❌ [NoveltyAgent:reconComplete] Error:', error);
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
    }
);
// Define all tools available to the agent
const tools = [askNextQuestion, replyToUser, reconComplete];

// Initialize the model
console.log('🤖 Initializing Claude model for NoveltyAgent');
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

let noveltyAgent: any = null;
let checkpointerNovelty: MemorySaver;

// Initialize the agent
export async function initializeNoveltyAgent(patentDocument?: string) {
    // console.log(patentDocument);
    await initializeModel();
    console.log('💾 Initializing memory saver for NoveltyAgent');
    checkpointerNovelty = new MemorySaver();
    
    let systemPrompt = `You are an expert in novelty assessment for patent applications. Your role is to ask targeted questions to uncover the truly novel, non-obvious, and patentable aspects of the invention.

Guidelines for Questioning
1. Ask One Question at a Time. 
- Never combine multiple questions—keep each inquiry focused. 
- Use follow-up questions to refine and probe deeper.
- Adapt your questioning based on the user's responses.

Try to extract the exhaustive list of all the novel aspects of the invention. Ask questions to understand the invention in depth.   

Assess the invention across multiple dimensions:
- Technical Uniqueness: What specific features or mechanisms differentiate this invention?
- Inventive Step Analysis: Would an expert in the field find this approach obvious or surprising?
- Combination of Known Elements: Are existing technologies being combined in an unconventional way?
- Unexpected Results: Does the invention lead to performance, efficiency, or usability improvements that are not obvious?
- Market Disruption Potential: How does this approach change industry standards or user expectations?

3. Prior Art Investigation
- Identify competing solutions or patents and directly compare them.
- Pinpoint the precise aspect that is missing in prior art—is it a new process, a structural improvement, a novel algorithm, or a unique interaction model?
- If similar concepts exist, ask: What stops those solutions from achieving the same effect as this invention?

4. Strengthening Patentability
- Guide the user in reframing non-novel aspects into patentable claims.
- If novelty is weak, explore adjacent innovations that could enhance uniqueness.
- Identify broad vs. narrow claims, helping structure a robust patent strategy.

Maintain a constructive approach—even if the initial invention seems non-novel, find angles that strengthen its claimability.`;

    // Add patent document to system prompt if provided
    if (patentDocument) {
        systemPrompt += `\n\nCurrent Patent Document:\n${patentDocument}\n\nAnalyze the above patent document and focus your questions on uncovering novel aspects not yet documented or areas that need more detail to establish patentability.`;
    }

    systemPrompt += `\n\n# TOOL USAGE
- Use ask_next_question for each focused, context-driven query
- Use recon_complete when you have gathered sufficient novelty information
- Use reply_to_user to maintain conversational flow`;

    // Create the agent with the system message
    noveltyAgent = createReactAgent({
        llm: model,
        tools,
        checkpointSaver: checkpointerNovelty,
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
    await noveltyAgent.invoke(
        { messages: [systemMessage, userMessage] },
        { configurable: { thread_id: `novelty_init_${Date.now()}` } }
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
        if (!currentThreadIdNovelty) {
            currentThreadIdNovelty = `novelty_${Date.now()}`;
            console.log('🆕 [invokeNoveltyAgent] Creating new thread:', currentThreadIdNovelty);
        }


        const userMsg = {
            role: 'user',
            content: userMessage.trim(),
        };

        let messages = [userMsg];

        const response = await noveltyAgent.invoke(
            { messages: messages },
            { configurable: { thread_id: currentThreadIdNovelty } }
        );

        const structuredResponse = response.structuredResponse;
        const toolCalls = (typeof structuredResponse === 'function' ? structuredResponse() : {}) || {};

        console.log('✅ [invokeNoveltyAgent] Response received:', {
            threadId: currentThreadIdNovelty,
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
        if (!currentThreadIdNovelty) {
            currentThreadIdNovelty = null;
        }
        throw error;
    }
}

export function resetNoveltyThread() {
    console.log('🔄 [resetNoveltyThread] Resetting current thread');
    currentThreadIdNovelty = null;
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
            prompt = `The user has provided a screenshot containing code or a diagram for novelty assessment.
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
            { configurable: { thread_id: currentThreadIdNovelty } }
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