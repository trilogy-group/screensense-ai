import { Client } from '@gradio/client';

interface Element {
  type: string;
  content: string;
  interactivity: boolean;
  center: {
    x: number;
    y: number;
  };
  boundingBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

interface DetectionResult {
  data: [string, string]; // [image_base64, description]
}

interface ParsedDetectionResult {
  data: [string, Element[]]; // [image_base64, structured_elements]
}

export class OmniParser {
  private client: Client | null = null;
  private readonly endpoint = 'http://34.199.128.33:7861/';
  private lastRequestTime: number = 0;
  private readonly minRequestInterval = 200;

  private async waitForNextRequest(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  private parseElementsList(description: string): Element[] {
    const lines = description.split('\n');
    return lines
      .map(line => {
        // Match the pattern: type: text, content: X, interactivity: Y, center: (0.05, 0.02), box: (0.02, 0.01, 0.08, 0.03)
        // console.log("line", line)
        const typeMatch = line.match(/type: ([^,]+),/);
        const contentMatch = line.match(/content: ([^,]+),/);
        const interactivityMatch = line.match(/interactivity: ([^,]+),/);
        const centerMatch = line.match(/center: \(([^,]+), ([^)]+)\)/);
        const boundingBoxMatch = line.match(/bbox: \(([^,]+), ([^,)]+), ([^,]+), ([^)]+)\)/);

        if (!typeMatch || !contentMatch || !interactivityMatch || !centerMatch || !boundingBoxMatch) {
          console.log('Failed to parse line:', line);
          return null;
        }

        const element: Element = {
          type: typeMatch[1].trim(),
          content: contentMatch[1].trim(),
          interactivity: interactivityMatch[1].trim().toLowerCase() === 'true',
          center: {
            x: parseFloat(centerMatch[1]),
            y: parseFloat(centerMatch[2]),
          },
          boundingBox: {
            x1: parseFloat(boundingBoxMatch[1]),
            y1: parseFloat(boundingBoxMatch[2]),
            x2: parseFloat(boundingBoxMatch[3]),
            y2: parseFloat(boundingBoxMatch[4]),
          }
        }

        return element;
      })
      .filter((element): element is Element => element !== null);
  }

  async initialize() {
    console.log('OmniParser: Initializing client...');
    try {
      if (!this.client) {
        this.client = await Client.connect(this.endpoint);
        console.log('OmniParser: Client initialized successfully');
      } else {
        console.log('OmniParser: Client already initialized');
      }
    } catch (error) {
      console.error('OmniParser: Failed to initialize client:', error);
      throw error;
    }
  }

  async detectElements(imageBlob: Blob): Promise<ParsedDetectionResult> {
    await this.waitForNextRequest();
    console.log('OmniParser: Starting element detection...');
    console.log('OmniParser: Image blob size:', imageBlob.size, 'bytes');
    console.log('OmniParser: Image blob type:', imageBlob.type);

    if (!this.client) {
      console.log('OmniParser: Client not initialized, initializing now...');
      await this.initialize();
    }

    try {
      // Check server availability first
      try {
        const response = await fetch(this.endpoint);
        if (!response.ok) {
          throw new Error(`Server returned status ${response.status}`);
        }
      } catch (error) {
        throw new Error(`Failed to connect to server at ${this.endpoint}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      console.log('OmniParser: Sending prediction request to endpoint...');
      const result = (await this.client!.predict('/process', {
        image_input: imageBlob,
        box_threshold: 0.1,
        iou_threshold: 1,
        use_paddleocr: false,
        imgsz: 3200,
        icon_process_batch_size: 256,
      })) as DetectionResult;

      if (!result || !result.data) {
        throw new Error('Invalid response format from server');
      }

      console.log('OmniParser: Received response from endpoint');
      console.log('OmniParser: Raw response:', result);

      // Parse the elements list into structured data
      const elements = this.parseElementsList(result.data[1]);
      console.log('OmniParser: Parsed elements:', elements);
      return {
        data: [result.data[0], elements],
      };
    } catch (error) {
      console.error('OmniParser: Error during element detection:', error);
      // Enhance error information
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : { message: 'Unknown error occurred' };
      console.error('OmniParser: Error details:', errorDetails);
      throw error;
    }
  }

  async getBoundingBox(element: Element): Promise<Element['boundingBox'] | null> {
    if (!element.boundingBox) {
      console.warn('OmniParser: No bounding box information available for element:', element);
      return null;
    }
    return element.boundingBox;
  }
}

export const omniParser = new OmniParser();
