import { Client } from "@gradio/client";

interface DetectionResult {
  data: [string, string]; // [image_base64, description]
}

export class OmniParser {
  private client: Client | null = null;
  private readonly endpoint = "http://52.90.204.78:7861/";

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

  async detectElements(imageBlob: Blob): Promise<DetectionResult> {
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
        box_threshold: 0.01,
        iou_threshold: 0.1,
        use_paddleocr: true,
        imgsz: 1920,
        icon_process_batch_size: 256,
      }) as DetectionResult;

      console.log('OmniParser: Received response from endpoint');
      console.log('OmniParser: Response data length:', result.data.length);
      console.log('OmniParser: Elements description:', result.data[1]);

      return result;
    } catch (error) {
      console.error('OmniParser: Error during element detection:', error);
      throw error;
    }
  }
}

export const omniParser = new OmniParser();
