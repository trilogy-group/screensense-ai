import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
export async function anthropic_completion(
  prompt: string,
  apiKey: string,
  jsonMode: boolean = false,
  systemPrompt: string | undefined = undefined
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
  if (jsonMode) {
    let jsonMessage = '';
    if (message.startsWith('{')) {
      jsonMessage = message.substring(0, message.lastIndexOf('}') + 1);
    } else {
      jsonMessage = '{' + message.substring(0, message.lastIndexOf('}') + 1);
    }
    try {
      // console.log(`Received JSON response from anthropic: ${message}`);
      // console.log(`Parsing JSON response: ${jsonMessage}`);
      return JSON.stringify(JSON.parse(jsonMessage));
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
      return message;
    }
  }

  return message;
}

export async function analyseCode(codeImages: string[], apiKey: string) {
  const messages = [{
    role: "user" as const,
    content: [
      {
        type: "text" as const,
        text: "Analyze these code screenshots comprehensively."
      },
      ...codeImages.map((filepath) => {
        // Ensure we're working with just the base64 data without the data URL prefix
        const image = fs.readFileSync(filepath, {encoding: 'base64'});
        // console.log(image)
        
        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: "image/png" as const,
            data: image
          }
        };
      })
    ]
  }];

  const anthropic = new Anthropic({
    apiKey: apiKey,
  });

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 4096,
    messages,
    system: "You are and expert at extracting code from images. Given a set of images, you will extract the code and return it in a structured format."
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
