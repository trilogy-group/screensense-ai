import cv from '@techstark/opencv-js';

interface TemplateMatchResult {
  location: { x: number; y: number };
  confidence: number;
}

export class OpenCVService {
  private async base64ToMat(base64Image: string): Promise<cv.Mat> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const mat = cv.imread(img);
        resolve(mat);
      };
      img.onerror = reject;
      // Use the base64 string directly if it's a data URL, or convert it to one
      img.src = base64Image.startsWith('data:')
        ? base64Image
        : `data:image/png;base64,${base64Image}`;
    });
  }

  private async loadTemplate(templatePath: string): Promise<cv.Mat> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const mat = cv.imread(img);
        resolve(mat);
      };
      img.onerror = reject;
      img.src = templatePath;
    });
  }

  async findTemplate(
    screenImage: string,
    templatePath: string,
    threshold: number = 0.0,
    method: number = cv.TM_CCOEFF_NORMED
  ): Promise<TemplateMatchResult | null> {
    try {
      const screen = await this.base64ToMat(screenImage);
      const template = await this.loadTemplate(templatePath);

      const screenGray = new cv.Mat();
      const templateGray = new cv.Mat();
      cv.cvtColor(screen, screenGray, cv.COLOR_RGBA2GRAY);
      cv.cvtColor(template, templateGray, cv.COLOR_RGBA2GRAY);

      const result = new cv.Mat();
      cv.matchTemplate(screenGray, templateGray, result, method);

      const mask = new cv.Mat();
      const minMax = cv.minMaxLoc(result, mask);
      mask.delete();
      const { maxVal, maxLoc } = minMax;

      // Store dimensions before cleanup
      const templateWidth = template.cols;
      const templateHeight = template.rows;

      // Cleanup
      screen.delete();
      template.delete();
      screenGray.delete();
      templateGray.delete();
      result.delete();

      if (maxVal >= threshold) {
        // Calculate midpoint of the matched region
        const centerX = maxLoc.x + Math.floor(templateWidth / 2);
        const centerY = maxLoc.y + Math.floor(templateHeight / 2);
        return {
          location: {
            x: centerX,
            y: centerY,
          },
          confidence: maxVal,
        };
      }

      return null;
    } catch (error) {
      console.error('Template matching error:', error);
      return null;
    }
  }
  async findTemplateColor(
    screenImage: string,
    templatePath: string,
    threshold: number = 0.0,
    method: number = cv.TM_CCOEFF_NORMED
  ): Promise<TemplateMatchResult | null> {
    try {
      const screen = await this.base64ToMat(screenImage);
      const template = await this.loadTemplate(templatePath);

      // Ensure both images have the same number of channels
      if (screen.channels() !== template.channels()) {
        cv.cvtColor(screen, screen, cv.COLOR_BGRA2BGR); // Convert to 3-channel BGR
        cv.cvtColor(template, template, cv.COLOR_BGRA2BGR);
      }

      const result = new cv.Mat();
      cv.matchTemplate(screen, template, result, method);

      const mask = new cv.Mat();
      const minMax = cv.minMaxLoc(result, mask);
      mask.delete();
      const { maxVal, maxLoc } = minMax;

      // Store dimensions before cleanup
      const templateWidth = template.cols;
      const templateHeight = template.rows;

      // Cleanup
      screen.delete();
      template.delete();
      result.delete();

      if (maxVal >= threshold) {
        return {
          location: {
            x: maxLoc.x + Math.floor(templateWidth / 2),
            y: maxLoc.y + Math.floor(templateHeight / 2),
          },
          confidence: maxVal,
        };
      }

      return null;
    } catch (error) {
      console.error('Template matching error:', error);
      return null;
    }
  }
  async findTemplateCanny(
    screenImage: string,
    templatePath: string,
    threshold: number = 0.0,
    method: number = cv.TM_CCOEFF_NORMED
  ): Promise<TemplateMatchResult | null> {
    try {
      const screen = await this.base64ToMat(screenImage);
      const template = await this.loadTemplate(templatePath);

      // Convert to grayscale for edge detection
      const screenGray = new cv.Mat();
      const templateGray = new cv.Mat();
      cv.cvtColor(screen, screenGray, cv.COLOR_RGBA2GRAY);
      cv.cvtColor(template, templateGray, cv.COLOR_RGBA2GRAY);

      // Apply Canny edge detection to emphasize structure
      const screenEdges = new cv.Mat();
      const templateEdges = new cv.Mat();
      cv.Canny(screenGray, screenEdges, 50, 150); // Adjust thresholds as needed
      cv.Canny(templateGray, templateEdges, 50, 150);

      // Perform template matching on edges
      const result = new cv.Mat();
      cv.matchTemplate(screenEdges, templateEdges, result, method);

      const mask = new cv.Mat();
      const minMax = cv.minMaxLoc(result, mask);
      mask.delete();
      const { maxVal, maxLoc } = minMax;

      // Store dimensions before cleanup
      const templateWidth = template.cols;
      const templateHeight = template.rows;

      // Cleanup
      screen.delete();
      template.delete();
      screenGray.delete();
      templateGray.delete();
      screenEdges.delete();
      templateEdges.delete();
      result.delete();

      if (maxVal >= threshold) {
        return {
          location: {
            x: maxLoc.x + Math.floor(templateWidth / 2),
            y: maxLoc.y + Math.floor(templateHeight / 2),
          },
          confidence: maxVal,
        };
      }

      return null;
    } catch (error) {
      console.error('Template matching error:', error);
      return null;
    }
  }
}

export const opencvService = new OpenCVService();
