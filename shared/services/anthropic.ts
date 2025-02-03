import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async function anthropic_completion(
  prompt: string,
  jsonMode: boolean = false,
  systemPrompt: string | undefined = undefined
) {
  const messages = [
    {
      role: 'user',
      content: prompt,
    },
  ];
  if (jsonMode) {
    messages.push({
      role: 'assistant',
      content: '{',
    });
  }
  const response = await anthropic.messages.create({
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 8192,
    temperature: 0,
    system: systemPrompt,
  });
  const content = response.content[0];
  let message = 'type' in content && content.type === 'text' ? content.text : '';
  let jsonMessage = '';
  if (message.startsWith('{')) {
    jsonMessage = message.substring(0, message.lastIndexOf('}') + 1);
  } else {
    jsonMessage = '{' + message.substring(0, message.lastIndexOf('}') + 1);
  }
  if (jsonMode) {
    try {
      console.log(`Received JSON response from anthropic: ${message}`);
      console.log(`Parsing JSON response: ${jsonMessage}`);
      return JSON.stringify(JSON.parse(jsonMessage));
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
      return message;
    }
  }

  return message;
}
