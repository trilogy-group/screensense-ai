import Anthropic from '@anthropic-ai/sdk';
import { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';

export interface AnthropicCallbacks {
  onThinking?: (thinkingText: string) => void;
  onText?: (text: string) => void;
}

export default async function anthropicCompletion(
  prompt: string,
  apiKey: string,
  systemPrompt: string | undefined = undefined,
  thinking: boolean = false,
  thinkingTokens: number = 1024,
  callbacks?: AnthropicCallbacks
) {
  const anthropic = new Anthropic({
    apiKey: apiKey,
  });
  const messages = [
    {
      role: 'user',
      content: prompt,
    },
  ];

  // Always use streaming API
  let fullText = '';
  let fullThinking = '';

  const inputParams = {
    messages: messages as Anthropic.Beta.Messages.BetaMessageParam[],
    model: 'claude-3-7-sonnet-latest',
    max_tokens: 128000,
    temperature: thinking ? 1 : 0,
    system: systemPrompt,
    betas: ['output-128k-2025-02-19'],
    ...(thinking && {
      thinking: {
        type: 'enabled',
        budget_tokens: Math.max(thinkingTokens, 1024),
      },
    }),
  } as BetaMessageStreamParams;

  const stream = await anthropic.beta.messages.stream(inputParams);

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'thinking_delta') {
        fullThinking += event.delta.thinking;
        // Invoke the onThinking callback if provided
        if (callbacks?.onThinking) {
          callbacks.onThinking(event.delta.thinking);
        }
      } else if (event.delta.type === 'text_delta') {
        fullText += event.delta.text;
        // Invoke the onText callback if provided
        if (callbacks?.onText) {
          callbacks.onText(event.delta.text);
        }
      }
    }
  }

  if (fullThinking) {
    console.log(`Sonnet thinking: ${fullThinking}`);
  }

  return fullText;
}
