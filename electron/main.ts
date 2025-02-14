import { Button, Key, keyboard, mouse, Point } from '@nut-tree-fork/nut-js';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  screen as electron_screen,
  ipcMain,
} from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { uIOhook, UiohookMouseEvent } from 'uiohook-napi';
import { logToFile } from '../src/utils/logger';
import { loadSession } from '../src/utils/patent-utils';
import { initializeActionWindow } from '../src/windows/ActionWindow';
import { createControlWindow, initializeControlWindow } from '../src/windows/ControlWindow';
import { initializeErrorOverlay } from '../src/windows/ErrorOverlay';
import { createMainWindow, initializeMainWindow } from '../src/windows/MainWindow';
import { initializeMarkdownPreviewWindow } from '../src/windows/MarkdownPreviewWindow';
import { initializeSettingsWindow } from '../src/windows/SettingsWindow';
import {
  createSubtitleOverlayWindow,
  initializeSubtitleOverlay,
} from '../src/windows/SubtitleOverlay';
import { initializeUpdateWindow } from '../src/windows/UpdateWindow';
import { initializeContext } from '../src/utils/context-utils';
dotenv.config();

// Set environment variables for the packaged app
if (!app.isPackaged) {
  require('dotenv-flow').config();
} else {
  require('dotenv').config({ path: path.join(process.resourcesPath, '.env') });
}

// Add recording state flag
let isRecording = false;
let screenshotInterval: NodeJS.Timeout | null = null;
let latestScreenshot: { path: string; timestamp: number } | null = null;
let lastClickTime: number | null = null;

interface ConversationScreenshot {
  function_call: string;
  description: string;
  filepath: string;
  payload: string;
  timeSinceLastAction: number;
}

interface ConversationsScreenshots {
  [key: string]: ConversationScreenshot[];
}

let conversations_screenshots: ConversationsScreenshots = {};

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
        await fs.promises.writeFile(originalPath, buffer);

        // Then crop from the bordered image
        await sharp(originalPath)
          .extract({
            left: cropX,
            top: cropY,
            width: cropSize,
            height: cropSize,
          })
          .toFile(cropPath);
      });

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

function getFirstLaunchPath(machineId: string) {
  return path.join(app.getPath('userData'), `first_launch_${machineId}.txt`);
}

function checkFirstLaunch(machineId: string) {
  const firstLaunchPath = getFirstLaunchPath(machineId);
  const isFirstLaunch = !fs.existsSync(firstLaunchPath);

  if (isFirstLaunch) {
    try {
      fs.writeFileSync(firstLaunchPath, new Date().toISOString());
    } catch (error) {
      logToFile(`Error creating first launch file: ${error}`);
    }
  }

  return isFirstLaunch;
}

ipcMain.handle('check-first-launch', async () => {
  const machineId = await getMachineId();
  return checkFirstLaunch(machineId);
});

// Add handler for logging to file
ipcMain.on('log-to-file', (event, message) => {
  logToFile(message);
});

// Initialize app with saved settings
async function initializeApp() {
  // Initialize window modules
  initializeMainWindow();
  initializeControlWindow();
  initializeUpdateWindow();
  initializeErrorOverlay();
  initializeSubtitleOverlay();
  initializeSettingsWindow();
  initializeMarkdownPreviewWindow();
  initializeActionWindow();
  initializeContext();

  // Create windows
  await createMainWindow();
  createSubtitleOverlayWindow();
  createControlWindow();
  console.log('App is ready. Listening for global mouse events...');
}

// Call it after registering all handlers
app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    initializeApp();
  }
});

// Handle IPC for screen sharing
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  });
  return sources;
});

async function getSelectedText() {
  try {
    // Save current clipboard content
    const previousClipboard = clipboard.readText();

    // Simulate Cmd+C (for macOS) or Ctrl+C (for other platforms)
    const modifier = process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;
    await keyboard.pressKey(modifier, Key.C);
    await keyboard.releaseKey(modifier, Key.C);

    // Wait a bit for the clipboard to update
    await new Promise(resolve => setTimeout(resolve, 50));

    // Get the selected text from clipboard
    const selectedText = clipboard.readText();
    // logToFile(`Selected text: ${selectedText}`);

    // Restore previous clipboard content
    clipboard.writeText(previousClipboard);

    return selectedText;
  } catch (error) {
    logToFile(`Error getting selected text: ${error}`);
    return '';
  }
}

// Add this with other IPC handlers
ipcMain.handle('read_selection', async () => {
  return await getSelectedText();
});

// Add this after the other ipcMain handlers
ipcMain.on('write_text', async (event, content) => {
  try {
    // Save the current clipboard content
    const previousClipboard = clipboard.readText();

    // Set new content to clipboard
    clipboard.writeText(content);

    // Simulate Cmd+V (for macOS) or Ctrl+V (for other platforms)
    const modifier = process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;
    await keyboard.pressKey(modifier, Key.V);
    await keyboard.releaseKey(modifier, Key.V);

    // Restore previous clipboard content after a short delay
    setTimeout(() => {
      clipboard.writeText(previousClipboard);
    }, 100);
  } catch (error) {
    logToFile(`Error writing text: ${error}`);
  }
});

ipcMain.on('insert-content', async (event, content: string) => {
  try {
    // Store previous clipboard content
    const previousClipboard = clipboard.readText();
    // Set new content
    clipboard.writeText(content);
    // Wait briefly to ensure clipboard is updated
    await new Promise(resolve => setTimeout(resolve, 100));
    const modifier = process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;
    await keyboard.pressKey(modifier, Key.V);
    await keyboard.releaseKey(modifier, Key.V);
    await new Promise(resolve => setTimeout(resolve, 100));
    // Restore previous clipboard content
    clipboard.writeText(previousClipboard);
  } catch (error) {
    logToFile(`Error inserting content: ${error}`);
  }
});

// Get unique machine ID
async function getMachineId(): Promise<string> {
  try {
    if (process.platform === 'darwin') {
      // Try to get hardware UUID on macOS
      const output = execSync(
        "ioreg -d2 -c IOPlatformExpertDevice | awk -F\\\" '/IOPlatformUUID/{print $(NF-1)}'"
      )
        .toString()
        .trim();
      return output;
    } else if (process.platform === 'win32') {
      // Get Windows machine GUID
      const output = execSync(
        'get-wmiobject Win32_ComputerSystemProduct  | Select-Object -ExpandProperty UUID'
      )
        .toString()
        .trim();
      // const match = output.match(/[A-F0-9]{8}[-][A-F0-9]{4}[-][A-F0-9]{4}[-][A-F0-9]{4}[-][A-F0-9]{12}/i);
      // return match ? match[0] : '';
      return output;
    } else {
      // For Linux and others, try to get machine-id
      const machineId = fs.readFileSync('/etc/machine-id', 'utf8').trim();
      return machineId;
    }
  } catch (error) {
    console.error('Error getting machine ID:', error);
    // Fallback: Generate a persistent hash based on available system info
    const systemInfo = `${app.getPath('home')}-${process.platform}-${process.arch}`;
    return crypto.createHash('sha256').update(systemInfo).digest('hex');
  }
}

// Add this with other IPC handlers
ipcMain.handle('get-machine-id', async () => {
  const machineId = await getMachineId();
  return machineId;
});

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

// Reset only the session name when app starts or restarts
app.on('ready', () => {
  loadSession();
});

// Add handler for getting action data
ipcMain.handle('perform-action', async (event, name) => {
  try {
    const conversations = loadConversations();
    const actionName = name.trim().toLowerCase();

    if (conversations[actionName]) {
      let actions = conversations[actionName];
      const modifier = process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;

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

// Add near the top with other IPC handlers
ipcMain.handle('get-env', async (event, key) => {
  // Only allow specific env vars to be accessed
  const allowedKeys = ['REACT_APP_ANTHROPIC_API_KEY'];
  if (allowedKeys.includes(key)) {
    return process.env[key];
  }
  return null;
});
