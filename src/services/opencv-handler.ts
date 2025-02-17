import { opencvService } from './opencv-service';
import { ipcRenderer } from 'electron';

export async function handleOpenCVTools(toolName: string, args: any) {
  switch (toolName) {
    case 'find_template': {
      const screenshot = await ipcRenderer.invoke('take-screenshot');
      if (!screenshot) return { success: false, error: 'Failed to capture screenshot' };

      const result = await opencvService.findTemplate(
        `data:image/png;base64,${screenshot.split(',')[1]}`,
        args.template_path,
        args.threshold,
        args.method
      );

      return {
        success: !!result,
        location: result?.location,
        confidence: result?.confidence
      };
    }

    case 'click_template': {
      const screenshot = await ipcRenderer.invoke('take-screenshot');
      if (!screenshot) return { success: false, error: 'Failed to capture screenshot' };

      const result = await opencvService.findTemplate(
        `data:image/png;base64,${screenshot.split(',')[1]}`,
        args.template_path,
        args.threshold
      );

      if (result) {
        // Send click command to main process
        await ipcRenderer.invoke('click', result.location.x, result.location.y, args.action);
        return { success: true };
      }

      return { success: false, error: 'Template not found' };
    }

    default:
      return { success: false, error: 'Unknown tool' };
  }
} 