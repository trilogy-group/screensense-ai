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
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import OpenAI from 'openai';
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

ipcMain.on('session-start', () => {
  console.log('Session started');

  const contextDir = path.join(app.getPath('appData'), 'screensense-ai', 'context');
  const userDir = path.join(contextDir, 'user');
  const assistantDir = path.join(contextDir, 'assistant');

  // Function to recursively clean a directory
  const cleanDirectory = (dirPath: string) => {
    if (fs.existsSync(dirPath)) {
      fs.readdirSync(dirPath).forEach(file => {
        const curPath = path.join(dirPath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          // Recurse for directories
          cleanDirectory(curPath);
          try {
            fs.rmdirSync(curPath);
          } catch (err) {
            console.error(`Error removing directory ${curPath}:`, err);
          }
        } else {
          // Remove files
          try {
            fs.unlinkSync(curPath);
          } catch (err) {
            console.error(`Error removing file ${curPath}:`, err);
          }
        }
      });
    }
  };

  try {
    // Ensure the directory exists
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }

    // Clean existing files in context directory
    cleanDirectory(contextDir);

    // Recreate subdirectories
    [userDir, assistantDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    console.log('Session directories cleaned and recreated successfully');
  } catch (error) {
    console.error('Error during session cleanup:', error);
  }
});

ipcMain.handle('get-context', async event => {
  const contextDir = path.join(app.getPath('appData'), 'screensense-ai', 'context');
  const textFilePath = path.join(contextDir, 'transcriptions.txt');
  if (fs.existsSync(textFilePath)) {
    const context = fs.readFileSync(textFilePath, 'utf8');
    console.log('Context:', context);
    return context;
  } else {
    console.log('No context found');
    return '';
  }
});

ipcMain.on('save-user-message-context', (event, text: string) => {
  // console.log('save-user-message-context', text);
  const contextDir = path.join(app.getPath('appData'), 'screensense-ai', 'context');
  const textFilePath = path.join(contextDir, 'transcriptions.txt');

  // Ensure the directory exists
  if (!fs.existsSync(contextDir)) {
    fs.mkdirSync(contextDir, { recursive: true });
  }

  // Append the string "User : event" to the transcripts file
  fs.appendFile(textFilePath, `Instructions to assistant: ${text}\n`, err => {
    if (err) {
      console.error('Failed to append user message to file:', err);
    } else {
      // console.log('User message appended to file:', textFilePath);
    }
  });
});

// Add conversation audio handlers
ipcMain.on('save-conversation-audio', async (event, { buffer, type, index, timestamp }) => {
  const fileName = `conversation-${type}-${index}-${timestamp}.wav`;
  const filePath = path.join(app.getPath('userData'), 'context', type, fileName);

  // Ensure recordings directory exists
  await fs.promises.mkdir(path.join(app.getPath('userData'), 'context', type), { recursive: true });

  try {
    await fs.promises.writeFile(filePath, buffer);
    // console.log(`Saved ${type} audio chunk to ${filePath}`);
  } catch (error) {
    console.error(`Error saving ${type} audio chunk:`, error);
  }
});

// Add conversation metadata handler
ipcMain.on('save-conversation-metadata', async (event, metadata) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `conversation-metadata-${timestamp}.json`;
  const filePath = path.join(app.getPath('userData'), 'context', fileName);

  try {
    await fs.promises.writeFile(filePath, JSON.stringify(metadata, null, 2));
    // console.log(`Saved conversation metadata to ${filePath}`);
  } catch (error) {
    console.error('Error saving conversation metadata:', error);
  }
});

// Add interfaces for metadata types
interface AudioChunk {
  timestamp: number;
  duration: number;
}

interface ConversationMetadata {
  totalDuration: number;
  userChunks: AudioChunk[];
  assistantChunks: AudioChunk[];
}

async function transcribeAndMergeConversation(audioFilePath: string, assistantDisplayName: string) {
  const contextDir = path.join(app.getPath('appData'), 'screensense-ai', 'context');

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFilePath), // Use the file path
      model: 'whisper-1',
    });

    // console.log('Transcription:', transcription.text);

    const textFilePath = path.join(contextDir, 'transcriptions.txt');
    let olderConversation = '';

    if (fs.existsSync(textFilePath)) {
      olderConversation = ` 
${fs.readFileSync(textFilePath, 'utf8')}`;
    } else {
      olderConversation = 'There is no older conversation. This is start of new conversation.';
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `
You are a content paraphraser. The user will provide you with a conversation between a human and a helpful AI assistant called ${assistantDisplayName}. Your task is to paraphrase the conversation into a more correct and readable format. I want you to keep the original meaning of the conversation, but make it more readable and correct. 

It is possible that sometimes the conversation is incomplete, but you should not try to complete it. Do not add any new information or make up any information. Just correct the transcript.

Here is the older conversation:
${olderConversation}

You must return the older conversation along with the new conversation without separation. It should feel like continuous flow of conversation. You don't have to include all the information verbatim, but you must include the overall meaning. You must return the corrected conversation in the following format:
The assistant inquired about ...
The human responded with ...
The human asked for help with ...
The assistant provided the help by ...
...

Remember, you must return the entire conversation, including the older conversation and the new conversation combined.
You don't have to include everything, just enough so that someone can understand the conversation.
`,
        },
        {
          role: 'user',
          content: `Here is the new conversation, combine it with the older conversation: ${transcription.text}`,
        },
      ],
      temperature: 0,
      max_tokens: 8192,
    });

    // console.log('Paraphrased conversation:', completion.choices[0].message.content);

    // Append transcription to a single text file
    fs.writeFile(textFilePath, completion.choices[0].message.content + '\n', err => {
      if (err) {
        console.error('Failed to write transcription to file:', err);
      } else {
        // console.log('Transcription written to file:', textFilePath);
      }
    });
  } catch (error: any) {
    console.error('Error during speech-to-text conversion:', JSON.stringify(error, null, 2));
    console.error(
      'Error during speech-to-text conversion:',
      error.response ? error.response.data : error.message
    );
  }
}

// Add function to merge conversation audio
async function mergeConversationAudio(metadataPath: string, assistantDisplayName: string) {
  try {
    // console.log('Merging conversation audio, file:', metadataPath);
    // Read metadata
    const metadata: ConversationMetadata = JSON.parse(
      await fs.promises.readFile(metadataPath, 'utf8')
    );
    // console.log('Loaded metadata:', JSON.stringify(metadata, null, 2));

    const contextDir = path.join(app.getPath('userData'), 'context');
    const metadataTimestamp = path
      .basename(metadataPath)
      .replace('conversation-metadata-', '')
      .replace('.json', '');
    const outputPath = path.join(contextDir, `conversation-merged-${metadataTimestamp}.wav`);

    // Collect all input files and their timestamps
    const inputFiles: { path: string; timestamp: number }[] = [];
    const filesToDelete: string[] = [metadataPath]; // Track files to delete after merging

    // Add user chunks
    for (let i = 0; i < metadata.userChunks.length; i++) {
      const chunk = metadata.userChunks[i];
      const filePath = path.join(
        contextDir,
        'user',
        `conversation-user-${i}-${chunk.timestamp}.wav`
      );
      inputFiles.push({
        path: filePath,
        timestamp: chunk.timestamp,
      });
      filesToDelete.push(filePath);
    }

    // Add assistant chunks
    for (let i = 0; i < metadata.assistantChunks.length; i++) {
      const chunk = metadata.assistantChunks[i];
      const filePath = path.join(
        contextDir,
        'assistant',
        `conversation-assistant-${i}-${chunk.timestamp}.wav`
      );
      inputFiles.push({
        path: filePath,
        timestamp: chunk.timestamp,
      });
      filesToDelete.push(filePath);
    }

    // Build the filter complex string
    let filterComplex = '';
    const mixInputs: string[] = [];

    // Add each input file to the command and create its delay filter
    const command = ffmpeg();
    inputFiles.forEach((file, idx) => {
      if (fs.existsSync(file.path)) {
        command.input(file.path);
        // Apply delay to each input
        filterComplex += `[${idx}:a]adelay=${file.timestamp}|${file.timestamp}[a${idx}];`;
        mixInputs.push(`[a${idx}]`);
      }
    });

    // Add the mix command
    filterComplex += `${mixInputs.join('')}amix=inputs=${inputFiles.length}:normalize=0`;

    // Configure and run the command
    await new Promise((resolve, reject) => {
      command
        .complexFilter(filterComplex)
        .audioCodec('pcm_s16le')
        .on('error', (err: Error) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .on('end', () => {
          // console.log('FFmpeg processing finished');
          resolve(null);
        })
        .save(outputPath);
    });

    // console.log('Successfully merged conversation audio');

    // Transcribe the merged audio
    await transcribeAndMergeConversation(outputPath, assistantDisplayName);

    filesToDelete.push(outputPath);
    filesToDelete.push(metadataPath);

    // Clean up audio chunks and metadata file after successful merge
    for (const file of filesToDelete) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          // console.log(`Cleaned up file: ${file}`);
        }
      } catch (err) {
        console.error(`Error cleaning up file ${file}:`, err);
      }
    }

    return outputPath;
  } catch (error) {
    console.error('Error merging conversation audio:', error);
    throw error;
  }
}

// Add handler to trigger merging
ipcMain.on('merge-conversation-audio', async (event, data: { assistantDisplayName: string }) => {
  const contextDir = path.join(app.getPath('userData'), 'context');

  try {
    // Find metadata file in context directory
    const files = fs.readdirSync(contextDir);
    const metadataFile = files.find(
      file => file.startsWith('conversation-metadata-') && file.endsWith('.json')
    );

    if (!metadataFile) {
      console.error('No metadata file found in context directory');
      return;
    }

    const metadataPath = path.join(contextDir, metadataFile);
    await mergeConversationAudio(metadataPath, data.assistantDisplayName);
  } catch (error) {
    console.error('Error finding metadata file:', error);
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
