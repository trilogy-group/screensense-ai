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
      img.src = base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`;
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
    threshold: number = 0.2,
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
            y: centerY
          },
          confidence: maxVal
        };
      }

      return null;
    } catch (error) {
      console.error('Template matching error:', error);
      return null;
    }
  }

  async findAllTemplateMatches(
    screenImage: string,
    templatePath: string,
    threshold: number = 0.8
  ): Promise<TemplateMatchResult[]> {
    try {
      const screen = await this.base64ToMat(screenImage);
      const template = cv.imread(templatePath);

      const screenGray = new cv.Mat();
      const templateGray = new cv.Mat();
      cv.cvtColor(screen, screenGray, cv.COLOR_RGBA2GRAY);
      cv.cvtColor(template, templateGray, cv.COLOR_RGBA2GRAY);

      const result = new cv.Mat();
      cv.matchTemplate(screenGray, templateGray, result, cv.TM_CCOEFF_NORMED);
      
      const matches: TemplateMatchResult[] = [];
      for (let y = 0; y < result.rows; y++) {
        for (let x = 0; x < result.cols; x++) {
          const confidence = result.data32F[y * result.cols + x];
          if (confidence >= threshold) {
            matches.push({
              location: {
                x: x + template.cols / 2,
                y: y + template.rows / 2
              },
              confidence
            });
          }
        }
      }

      // Cleanup
      screen.delete();
      template.delete();
      screenGray.delete();
      templateGray.delete();
      result.delete();

      return matches;
    } catch (error) {
      console.error('Template matching error:', error);
      return [];
    }
  }
}

export const opencvService = new OpenCVService(); 