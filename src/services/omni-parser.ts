import { Client } from "@gradio/client";

interface Element {
  type: string;
  content: string;
  interactivity: boolean;
  center: {
    x: number;
    y: number;
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
  private readonly endpoint = "http://52.90.204.78:7861/";

  private parseElementsList(description: string): Element[] {
    const lines = description.split('\n');
    return lines.map(line => {
      // Match the pattern: type: text, content: X, interactivity: Y, center: (0.05, 0.02)
      const typeMatch = line.match(/type: ([^,]+),/);
      const contentMatch = line.match(/content: ([^,]+),/);
      const interactivityMatch = line.match(/interactivity: ([^,]+),/);
      const centerMatch = line.match(/center: \(([^,]+), ([^)]+)\)/);

      if (!typeMatch || !contentMatch || !interactivityMatch || !centerMatch) {
        console.log('Failed to parse line:', line);
        return null;
      }

      return {
        type: typeMatch[1].trim(),
        content: contentMatch[1].trim(),
        interactivity: interactivityMatch[1].trim().toLowerCase() === 'true',
        center: {
          x: parseFloat(centerMatch[1]),
          y: parseFloat(centerMatch[2])
        }
      };
    }).filter((element): element is Element => element !== null);
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
    console.log('OmniParser: Starting element detection...');
    console.log('OmniParser: Image blob size:', imageBlob.size, 'bytes');
    console.log('OmniParser: Image blob type:', imageBlob.type);

    if (!this.client) {
      console.log('OmniParser: Client not initialized, initializing now...');
      await this.initialize();
    }

    try {
      console.log('OmniParser: Sending prediction request to endpoint...');
      const result = await this.client!.predict("/process", {
        image_input: imageBlob,
        box_threshold: 0.4,
        iou_threshold: 0.4,
        use_paddleocr: true,
        imgsz: 1920,
        icon_process_batch_size: 256,
      }) as DetectionResult;

      console.log('OmniParser: Received response from endpoint');
      
      // Parse the elements list into structured data
      const elements = this.parseElementsList(result.data[1]);
      console.log('OmniParser: Parsed elements:', elements);

      return {
        data: [result.data[0], elements]
      };
    } catch (error) {
      console.error('OmniParser: Error during element detection:', error);
      throw error;
    }
  }
}

export const omniParser = new OmniParser();
