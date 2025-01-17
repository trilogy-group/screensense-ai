import Anthropic from '@anthropic-ai/sdk';

let anthropicClient: Anthropic | null = null;

export const initAnthropicClient = (anthropicApiKey: string) => {
  if (!anthropicApiKey) {
    throw new Error('Anthropic API key is required');
  }
  anthropicClient = new Anthropic({
    apiKey: anthropicApiKey,
    dangerouslyAllowBrowser: true,
  });
};

export const findElementInImage = async (
  base64Image: string, 
  elementDescription: string,
  width: number,
  height: number
): Promise<{x: number, y: number} | null> => {
  if (!anthropicClient) {
    throw new Error('Anthropic client not initialized');
  }

  try {
    const message = await anthropicClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `The screenshot shows a ${width}x${height} view of the screen. Find the coordinates of this element in the screenshot: ${elementDescription}. Return ONLY a JSON object with x and y coordinates within these dimensions. The coordinates should be in actual screen coordinates (already adjusted for display scaling). If element is not found, return null.`
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Image
            }
          }
        ]
      }]
    });

    console.log(`Received response from Anthropic: ${JSON.stringify(message)}`);

    const responseText = message.content[0].type === 'text' ? message.content[0].text : null;
    if (!responseText) return null;

    // Parse the response to get coordinates
    try {
      const response = JSON.parse(responseText);
      if (response && typeof response.x === 'number' && typeof response.y === 'number') {
        return { x: response.x, y: response.y };
      }
    } catch (e) {
      console.error('Failed to parse coordinates from response:', e);
    }
    return null;
  } catch (error) {
    console.error('Error calling Anthropic API:', error);
    throw error;
  }
};

export const matchElementFromDescription = async (
  elementsList: string,
  targetDescription: string
): Promise<{ x: number; y: number } | null> => {
  if (!anthropicClient) {
    throw new Error('Anthropic client not initialized');
  }

  try {
    const partialMessage = await anthropicClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Here is a list of UI elements and their locations: ${elementsList}

Find the element that best matches this description: "${targetDescription}"

Return ONLY a JSON object with x and y coordinates. If no matching element is found, return null.

Example response formats:
{"x": 100, "y": 200}
null`
          }
        ]
      }, {
        role: 'assistant',
        content: 'Here are the coordinates:\n{'
      }]
    });

    console.log(`Received response from Anthropic: ${JSON.stringify(partialMessage)}`);

    const responseText = partialMessage.content[0].type === 'text' ? partialMessage.content[0].text : null;
    if (!responseText) return null;

    const jsonOutput = '{' + responseText.slice(0, responseText.lastIndexOf("}") + 1)

    console.log('JSON output:', jsonOutput);

    try {
      const response = JSON.parse(jsonOutput);
      if (response && typeof response.x === 'number' && typeof response.y === 'number') {
        return { x: response.x, y: response.y };
      }
    } catch (e) {
      console.error('Failed to parse coordinates from response:', e);
    }
    return null;
  } catch (error) {
    console.error('Error calling Anthropic API:', error);
    throw error;
  }
}; 