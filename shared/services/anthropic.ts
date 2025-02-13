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


import axios from 'axios';

interface ClaudeImageResponse {
  content: string;
  // Add other response fields as needed
}

async function sendBase64ImageToClaude(
  base64Image: string,
  prompt: string,
  apiKey: string,
  mimeType: string = 'image/png'
): Promise<ClaudeImageResponse> {
  try {
    // Remove data URL prefix if present
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
    
    // Validate inputs
    if (!cleanBase64) {
      throw new Error('Base64 image string is required');
    }
    if (!apiKey) {
      throw new Error('API key is required');
    }

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-opus-20240229',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: cleanBase64
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'anthropic-api-key': apiKey,  // Changed from x-api-key to anthropic-api-key
          'anthropic-version': '2023-06-01'
        }
      }
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('API Error:', error.response?.data);
      throw new Error(`API request failed: ${error.response?.data?.error?.message || error.message}`);
    }
    throw error;
  }
}

// Example usage
async function example() {
  const apiKey = 'your-api-key';
  const base64Image = 'your-base64-string'; // Your base64 image string
  const mimeType = 'image/jpeg'; // Specify the correct MIME type
  const prompt = 'What can you tell me about this image?';

  try {
    const response = await sendBase64ImageToClaude(
      base64Image,
      prompt,
      apiKey,
      mimeType
    );
    console.log('Claude response:', response);
  } catch (error) {
    console.error('Error:', error);
  }
}

export { sendBase64ImageToClaude };