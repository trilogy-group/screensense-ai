import { Button, keyboard, mouse, Point } from '@nut-tree-fork/nut-js';
import { app, BrowserWindow, desktopCapturer, screen as electron_screen, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { uIOhook, UiohookMouseEvent } from 'uiohook-napi';
import { logToFile } from '../utils/logger';
import { loadHtmlFile } from '../utils/window-utils';
import { getMainWindow } from './MainWindow';
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import OpenAI from "openai";

let actionWindow: BrowserWindow | null = null;
let screenshotInterval: NodeJS.Timeout | null = null;
let latestScreenshot: { path: string; timestamp: number } | null = null;
let lastClickTime: number | null = null;
let isRecording = false;
let conversations_screenshots: ConversationsScreenshots = {};

interface ConversationScreenshot {
  function_call: string;
  description: string;
  filepath: string;
  accuratePath: string;
  payload: string;
  timeSinceLastAction: number;
}

interface ConversationsScreenshots {
  [key: string]: ConversationScreenshot[];
}

// Function to capture full screenshot
async function captureScreenshot() {
  try {
    const screenshotsDir = path.join(app.getPath('appData'), 'screensense-ai', 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Hide cursor before taking screenshot
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('set-cursor-visibility', 'none');
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Capture full screen at 1920x1080
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: 1920,
        height: 1080,
      },
    });

    if (sources.length > 0) {
      const primarySource = sources[0];
      const fullImage = primarySource.thumbnail;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = path.join(screenshotsDir, `screen-${timestamp}.png`);

      // Save the full screenshot
      fs.writeFileSync(screenshotPath, fullImage.toPNG());

      // Delete previous screenshot if it exists
      if (latestScreenshot && fs.existsSync(latestScreenshot.path)) {
        fs.unlinkSync(latestScreenshot.path);
      }

      // Update latest screenshot info
      latestScreenshot = {
        path: screenshotPath,
        timestamp: Date.now(),
      };

      console.log('Full screenshot captured:', screenshotPath);
    }

    // Show cursor after screenshot is taken
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('set-cursor-visibility', 'default');
    });
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    // Ensure cursor is shown even if there's an error
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('set-cursor-visibility', 'default');
    });
  }
}

async function createActionWindow() {
  if (actionWindow && !actionWindow.isDestroyed()) {
    return actionWindow;
  }

  actionWindow = new BrowserWindow({
    width: 120,
    height: 150,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    type: 'toolbar',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  actionWindow.setAlwaysOnTop(true, 'screen-saver');

  await loadHtmlFile(actionWindow, 'action-window.html', {
    logPrefix: 'action window',
  });

  actionWindow.setIgnoreMouseEvents(true);

  actionWindow.on('closed', () => {
    actionWindow = null;
  });

  return actionWindow;
}

export function actionWindowExists() {
  return actionWindow && !actionWindow.isDestroyed();
}

export function closeActionWindow() {
  if (actionWindowExists()) {
    actionWindow?.close();
  }
}

export async function showActionWindow() {
  const window = await createActionWindow();
  if (window && !window.isDestroyed()) {
    const primaryDisplay = electron_screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const windowBounds = window.getBounds();
    const x = screenWidth - windowBounds.width - 20;
    const y = screenHeight - windowBounds.height - 20;

    window.setPosition(x, y);
    window.showInactive();
  }
}

export function updateActionWindow(data: { imagePath: string; text: string }) {
  if (actionWindowExists()) {
    const fileUrl = `file://${data.imagePath.replace(/\\/g, '/')}`;
    actionWindow?.webContents.send('update-action', {
      imagePath: fileUrl,
      text: data.text,
    });
  }
}

export function hideActionWindow() {
  if (actionWindowExists()) {
    actionWindow?.hide();
  }
}

// Add function to handle conversation recording
function getActionsPath() {
  return path.join(app.getPath('appData'), 'screensense-ai', 'actions');
}

function ensureActionsDirectory() {
  const actionsPath = getActionsPath();
  if (!fs.existsSync(actionsPath)) {
    fs.mkdirSync(actionsPath, { recursive: true });
  }
  return actionsPath;
}

// Add function to get the conversations file path
function getConversationsFilePath() {
  const actionsPath = ensureActionsDirectory();
  return path.join(actionsPath, 'conversations.json');
}

// Add TypeScript interfaces
interface FunctionCall {
  name: string;
  args: {
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    direction?: string;
    amount?: number;
  };
}

interface ConversationEntry {
  function_call: string;
  args?: FunctionCall['args'];
  description: string;
  delay?: number;
  filepath: string;
  payload: string;
  timeSinceLastAction?: number;
}

interface Conversations {
  [key: string]: ConversationEntry[];
}

// Add function to load or initialize conversations file
function loadConversations(): Conversations {
  const filePath = getConversationsFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logToFile(`Error loading conversations: ${error}`);
  }
  return {};
}

// Add function to save conversations
function saveConversations(conversations: Conversations) {
  const filePath = getConversationsFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(conversations, null, 2));
    logToFile('Conversations saved successfully');
  } catch (error) {
    logToFile(`Error saving conversations: ${error}`);
  }
}

export function initializeActionWindow() {
  ipcMain.on('show-action', async () => {
    await showActionWindow();
  });

  ipcMain.on('update-action', async (event, data) => {
    updateActionWindow(data);
  });

  ipcMain.on('hide-action', () => {
    hideActionWindow();
  });

  // Add handler for getting action data
  ipcMain.handle('perform-action', async (event, name) => {
    try {
      const conversations = loadConversations();
      const actionName = name.trim().toLowerCase();

      if (conversations[actionName]) {
        let actions = conversations[actionName];

        // Return the actions data before executing them
        const actionData = actions;
        return actionData;
      } else {
        logToFile(`No action data found for: ${actionName}`);
        return null;
      }
    } catch (error) {
      logToFile(`Error getting action data: ${error}`);
      return null;
    }
  });

  ipcMain.on(
    'click',
    async (event, x: number, y: number, action: string, electron: boolean = true) => {
      try {
        const primaryDisplay = electron_screen.getPrimaryDisplay();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { bounds, workArea, scaleFactor } = primaryDisplay;

        // Account for taskbar offset and display scaling
        const x_scaled = Math.round(x * scaleFactor);
        const y_scaled = Math.round(y * scaleFactor);

        // Add display bounds offset
        let x_final, y_final;
        if (electron) {
          x_final = x_scaled + bounds.x;
          y_final = y_scaled + bounds.y;
        } else {
          x_final = Math.round(x);
          y_final = Math.round(y);
        }
        // await mouse.move(straightTo(new Point(x_final, y_final)));
        await mouse.setPosition(new Point(x_final, y_final));
        // await new Promise(resolve => setTimeout(resolve, 100));
        logToFile(
          `Going to perform action: ${action} at scaled coordinates: x=${x_final}, y=${y_final}`
        );
        console.log(action);
        if (action === 'click') {
          await mouse.leftClick();
        } else if (action === 'double-click') {
          await mouse.doubleClick(Button.LEFT);
          await mouse.releaseButton(Button.LEFT);
        } else if (action === 'right-click') {
          await mouse.rightClick();
        } else {
          logToFile(`Unknown action: ${action}`);
        }
      } catch (error) {
        logToFile(`Error performing click: ${error}`);
        console.log('error performing click', error);
      }
    }
  );

  ipcMain.handle('get-screenshot', async () => {
    try {
      await captureScreenshot();

      if (latestScreenshot && fs.existsSync(latestScreenshot.path)) {
        // Add border to the screenshot
        const borderedBuffer = await sharp(latestScreenshot.path)
          .extend({
            top: 100,
            bottom: 100,
            left: 100,
            right: 100,
            background: { r: 0, g: 0, b: 0, alpha: 1 },
          })
          .toBuffer();

        // Convert bordered buffer to base64
        const base64String = borderedBuffer.toString('base64');
        // Return with proper data URL format
        return `data:image/png;base64,${base64String}`;
      }
      return null;
    } catch (error) {
      console.error('Error getting screenshot:', error);
      return null;
    }
  });

  // Update IPC handlers for recording control
  ipcMain.on('start-capture-screen', () => {
    isRecording = true;
    lastClickTime = null;
    console.log('Started recording mouse actions');
    conversations_screenshots = { action: [] };
    saveConversations(conversations_screenshots);
    // Clear the actions/action folder
    const actionDir = path.join(app.getPath('appData'), 'screensense-ai', 'actions', 'action');
    if (fs.existsSync(actionDir)) {
      fs.readdirSync(actionDir).forEach(file => {
        fs.unlinkSync(path.join(actionDir, file));
      });
    }
    // Take first screenshot immediately
    captureScreenshot();

    // Start periodic screenshots
    screenshotInterval = setInterval(captureScreenshot, 800);
  });

  ipcMain.on('stop-capture-screen', () => {
    isRecording = false;
    lastClickTime = null;
    console.log('Stopped recording mouse actions');

    // Clear screenshot interval
    if (screenshotInterval) {
      clearInterval(screenshotInterval);
      screenshotInterval = null;
    }

    // Clean up latest screenshot
    if (latestScreenshot && fs.existsSync(latestScreenshot.path)) {
      fs.unlinkSync(latestScreenshot.path);
      latestScreenshot = null;
    }
  });

  ipcMain.on('gradio-result', async (event, result, cursorPos, screenshot, accuratePath) => {
    console.log("Gradio-Result Running")
    if (!result.success) {
      console.log("Omniparser Error", result.error);
      return;
    }
    try {
      const primaryDisplay = electron_screen.getPrimaryDisplay();
      const { bounds } = primaryDisplay;
  
  
      // Get the actual screen dimensions
      const actualWidth = bounds.width;
      const actualHeight = bounds.height;
  
      // Calculate scaling factors
      const scaleX = 1920 / actualWidth;
      const scaleY = 1080 / actualHeight;
  
      // Scale cursor position to 1920x1080 space
      const scaledX = Math.round(cursorPos.x * scaleX);
      const scaledY = Math.round(cursorPos.y * scaleY);
      let newDetectionResult = [];
      for (const element of result.detectionResult) {
        element.center.x *= 1920;
        element.center.y *= 1080;
        element.boundingBox.x1 *= 1920;
        element.boundingBox.y1 *= 1080;
        element.boundingBox.x2 *= 1920;
        element.boundingBox.y2 *= 1080;
        newDetectionResult.push(element);
      }
  
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
  
      const Coordinates = z.object({
        x1: z.number(),
        y1: z.number(),
        x2: z.number(),
        y2: z.number(),
      });
  
  
  
      console.log("trying to detect the element");
      const completion = await openai.beta.chat.completions.parse({
        model: "gpt-4o-2024-08-06",
        messages: [
          {
            role: "system", content: `
  The user will provide you a list of elements along with their center and bounding box. 
  Finally, He will give you the cursor position.
  Your job is to return the bounding box of the element that is under the cursor.
          ` },
          {
            role: "user", content: `
          Here is the list of elements:
          ${JSON.stringify(newDetectionResult)}
  
          Here is the cursor position:
          ${JSON.stringify({ x: scaledX, y: scaledY })}
          ` },
        ],
        response_format: zodResponseFormat(Coordinates, "coordinates"),
      });
      const box = completion.choices[0].message.parsed;
      console.log("box : ", box);;
  
  
      // Calculate crop area based on the bounding box returned by OpenAI
      if (box) {
        const cropWidth = Math.round(box.x2 - box.x1);
        const cropHeight = Math.round(box.y2 - box.y1);
  
  
        // Ensure crop bounds are within image boundaries
        const cropX = Math.round(Math.max(0, Math.min(1920, box.x1)));
        const cropY = Math.round(Math.max(0, Math.min(1080, box.y1)));
  
        // Crop the element from the original screenshot
        await sharp(screenshot)
          .extract({
            left: cropX,
            top: cropY,
            width: cropWidth,
            height: cropHeight,
          })
          .toFile(accuratePath);
  
        console.log(`Element under cursor saved to: ${accuratePath}`);
      }
    } catch (error) {
      console.log("Error in gradio-result: ", error);
    }
  });

  // Initialize global event listener
  uIOhook.on('mousedown', async (e: UiohookMouseEvent) => {
    // Only process clicks if recording is active and we have a screenshot
    if (!isRecording || !latestScreenshot) return;

    try {
      // Calculate time since last click
      const currentTime = Date.now();
      const timeSinceLastClick = lastClickTime ? currentTime - lastClickTime : 0;
      lastClickTime = currentTime;

      const primaryDisplay = electron_screen.getPrimaryDisplay();
      const { bounds } = primaryDisplay;
      const cursorPos = electron_screen.getCursorScreenPoint();

      // Get the actual screen dimensions
      const actualWidth = bounds.width;
      const actualHeight = bounds.height;

      // Calculate scaling factors
      const scaleX = 1920 / actualWidth;
      const scaleY = 1080 / actualHeight;

      // Scale cursor position to 1920x1080 space
      const scaledX = Math.round(cursorPos.x * scaleX);
      const scaledY = Math.round(cursorPos.y * scaleY);

      const ImageX = scaledX + 100;
      const ImageY = scaledY + 100;

      // Calculate crop area (100x100 pixels centered on click)
      const cropSize = 100;
      const halfSize = cropSize / 2;

      // Calculate crop bounds, ensuring we stay within image boundaries
      const cropX = Math.max(0, Math.min(2020, ImageX - halfSize));
      const cropY = Math.max(0, Math.min(1180, ImageY - halfSize));

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const cropped_images_dir = path.join(
        app.getPath('appData'),
        'screensense-ai',
        'actions',
        'action'
      );
      if (!fs.existsSync(cropped_images_dir)) {
        fs.mkdirSync(cropped_images_dir, { recursive: true });
      }

      const accuratePath = path.join(cropped_images_dir, `accurate-${timestamp}.png`);
      const cropPath = path.join(cropped_images_dir, `cropped-${timestamp}.png`);
      const originalPath = path.join(cropped_images_dir, `original-${timestamp}.png`);

      await fs.promises.copyFile(latestScreenshot.path, originalPath);

      // First add blue border to the original screenshot
      await sharp(originalPath)
        .extend({
          top: 100,
          bottom: 100,
          left: 100,
          right: 100,
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        })
        .toBuffer()
        .then(async buffer => {
          // Write the bordered image
          // await fs.promises.writeFile(originalPath, buffer);

          // Then crop from the bordered image
          await sharp(buffer)
            .extract({
              left: cropX,
              top: cropY,
              width: cropSize,
              height: cropSize,
            })
            .toFile(cropPath);
        });
      
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send('process-click', {
          screenshot: originalPath,
          cursorPos,
          bounds,
          accuratePath
        });
      }
      console.log(`Click area saved to: ${cropPath}`);
      console.log(`Original screenshot saved to: ${originalPath}`);

      const sessionName = 'action';
      if (!conversations_screenshots[sessionName]) {
        conversations_screenshots[sessionName] = [];
      }

      // Determine click type based on button
      let clickType = 'click'; // default to left click
      if (e.button === 2) {
        // right click
        clickType = 'right-click';
      } else if (e.clicks === 2) {
        // double click
        clickType = 'double-click';
      }

      conversations_screenshots[sessionName].push({
        function_call: clickType,
        description: `perform a ${clickType} here`,
        filepath: cropPath,
        accuratePath: accuratePath,
        payload: '',
        timeSinceLastAction: timeSinceLastClick,
      });
      saveConversations(conversations_screenshots);
    } catch (error) {
      console.error('Error processing click area:', error);
    }
  });

  // Start the listener
  uIOhook.start();

  keyboard.config.autoDelayMs = 0;
}
