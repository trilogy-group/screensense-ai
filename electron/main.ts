import { Button, Key, keyboard, mouse, Point } from '@nut-tree-fork/nut-js';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  screen as electron_screen,
  ipcMain,
  nativeImage,
  shell,
  WebContents,
} from 'electron';
import * as fs from 'fs';
import OpenAI from 'openai';
import * as path from 'path';
import sharp from 'sharp';
import { uIOhook, UiohookMouseEvent } from 'uiohook-napi';
import anthropic_completion from '../shared/services/anthropic';
import { patentGeneratorTemplate } from '../shared/templates/patent-generator-template';
import { initializeAutoUpdater } from './updater';
import { exec } from 'child_process';
import util from 'util';
import ffmpeg from 'fluent-ffmpeg';
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

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let controlWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let customSessionName: string | null = null;
let markerWindow: BrowserWindow | null = null;
let actionWindow: BrowserWindow | null = null;
let updateWindow: BrowserWindow | null = null;
let errorOverlayWindow: BrowserWindow | null = null;

let markdownPreviewWindow: BrowserWindow | null = null;
let currentMarkdownFile: string | null = null;
// let fileWatcher: any = null;

function logToFile(message: string) {
  const logPath = app.getPath('userData') + '/app.log';
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logPath, `${timestamp}: ${message}\n`);
}

// Add settings storage functions
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logToFile(`Error loading settings: ${error}`);
  }
  return { geminiApiKey: '' };
}

function saveSettings(settings: any) {
  try {
    const settingsPath = getSettingsPath();
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    logToFile('Settings saved successfully');
  } catch (error) {
    logToFile(`Error saving settings: ${error}`);
  }
}

// Add handler for getting saved settings
ipcMain.handle('get-saved-settings', async () => {
  return loadSettings();
});

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

async function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow; // Return existing window if it's still valid
  }

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  logToFile(`Starting app in ${isDev ? 'development' : 'production'} mode`);

  // Resolve icon path differently for dev mode
  let iconPath;
  if (isDev) {
    // In development, try multiple possible locations
    iconPath = path.resolve(
      __dirname,
      '..',
      'icons',
      process.platform === 'darwin' ? 'icon.icns' : 'icon.ico'
    );
    logToFile(`Using dev icon path: ${iconPath}`);
    if (!fs.existsSync(iconPath)) {
      logToFile('Warning: Could not find icon file in development mode');
    }
  } else {
    // Production path resolution
    iconPath = path.join(
      app.getAppPath(),
      'public',
      'icons',
      process.platform === 'darwin' ? 'icon.icns' : 'icon.ico'
    );
    if (!fs.existsSync(iconPath)) {
      logToFile('Warning: Could not find icon file in expected location');
    }
  }

  logToFile(`Using icon path: ${iconPath}`);
  try {
    const iconDir = path.dirname(iconPath);
    if (!fs.existsSync(iconDir)) {
      logToFile(`Icon directory doesn't exist: ${iconDir}`);
    } else {
      logToFile(`Icon directory contents: ${fs.readdirSync(iconDir)}`);
    }
  } catch (error) {
    logToFile(`Error checking icon path: ${error}`);
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    show: false,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    // For macOS, set the app icon explicitly
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 10, y: 10 },
        }
      : {}),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Temporarily disable for debugging
      devTools: true,
    },
  });

  // Initialize auto-updater
  initializeAutoUpdater(mainWindow);

  // Prevent window from being closed directly
  mainWindow.on('close', event => {
    event.preventDefault();
    mainWindow?.hide();
  });

  // Open DevTools in a new window
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Remove menu from the window
  mainWindow.setMenu(null);

  // Add IPC handler for closing main window
  ipcMain.on('close-main-window', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });

  // Set dock icon explicitly for macOS
  if (process.platform === 'darwin' && fs.existsSync(iconPath)) {
    try {
      const dockIcon = nativeImage.createFromPath(iconPath);
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
      } else {
        logToFile('Warning: Dock icon image is empty');
      }
    } catch (error) {
      logToFile(`Error setting dock icon: ${error}`);
    }
  }

  // Set permissions for media access
  if (mainWindow) {
    mainWindow.webContents.session.setPermissionRequestHandler(
      (webContents: WebContents, permission: string, callback: (granted: boolean) => void) => {
        const allowedPermissions = ['media', 'display-capture', 'screen', 'mediaKeySystem'];
        if (allowedPermissions.includes(permission)) {
          callback(true);
        } else {
          callback(false);
        }
      }
    );

    // Enable screen capture
    mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
      mainWindow?.webContents.send('show-screen-picker');
      callback({}); // Let the renderer handle source selection
    });

    let loadUrl: string;
    if (isDev) {
      loadUrl = 'http://localhost:3000';
    } else {
      // In production, use the app.getAppPath() to get the correct base path
      const appPath = app.getAppPath();
      // Remove .asar from the path to access unpacked resources
      const basePath = appPath.replace('.asar', '.asar.unpacked');
      const indexPath = path.join(basePath, 'build', 'index.html');

      // Log more details about the paths
      logToFile(`Base path: ${basePath}`);
      logToFile(`Index path: ${indexPath}`);
      logToFile(`Directory contents of build:`);
      try {
        const buildContents = fs.readdirSync(path.join(basePath, 'build'));
        logToFile(JSON.stringify(buildContents, null, 2));
      } catch (error) {
        logToFile(`Error reading build directory: ${error}`);
      }

      loadUrl = `file://${indexPath}`;
    }

    logToFile(`App path: ${app.getAppPath()}`);
    logToFile(`Attempting to load URL: ${loadUrl}`);
    logToFile(`Build path exists: ${fs.existsSync(loadUrl.replace('file://', ''))}`);

    try {
      await mainWindow.loadURL(loadUrl);
      logToFile('Successfully loaded the window URL');
    } catch (error) {
      logToFile(`Error loading URL: ${error}`);
    }

    // Log when the page finishes loading
    mainWindow.webContents.on('did-finish-load', () => {
      logToFile('Page finished loading');
      // Send saved settings to the renderer
      const savedSettings = loadSettings();
      mainWindow?.webContents.send('init-saved-settings', savedSettings);
    });

    // Log any errors that occur during page load
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      logToFile(`Failed to load: ${errorDescription} (${errorCode})`);
    });

    // Add console logging from the renderer process
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      logToFile(`Console [${level}]: ${message} (${sourceId}:${line})`);
    });
  }
  return mainWindow;
}

async function createControlWindow() {
  if (controlWindow && !controlWindow.isDestroyed()) {
    return controlWindow;
  }

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  controlWindow = new BrowserWindow({
    width: 250,
    height: 100,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true,
    },
  });

  // When control window is closed, close all other windows and quit the app
  controlWindow.on('closed', () => {
    // Force close all windows by removing their close event listeners
    if (mainWindow) {
      mainWindow.removeAllListeners('close');
      mainWindow.close();
    }
    if (settingsWindow) {
      settingsWindow.removeAllListeners('close');
      settingsWindow.close();
    }
    if (overlayWindow) {
      overlayWindow.removeAllListeners('close');
      overlayWindow.close();
    }
    controlWindow = null;
    app.quit();
  });

  // Open DevTools in a new window for control window
  // if (isDev) {
  //   controlWindow.webContents.openDevTools({ mode: "detach" });
  // }

  // Ensure it stays on top even when other windows request always on top
  controlWindow.setAlwaysOnTop(true, 'screen-saver');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            background: transparent;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            height: 100%;
            overflow: hidden;
            -webkit-app-region: drag;
            isolation: isolate;
          }
          body {
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(5px);
            background: transparent;
          }
          .window-content {
            position: relative;
            background: rgba(23, 23, 23, 0.6);
            width: 100%;
            height: 100%;
            transition: background-color 0.3s ease;
            /* Clear any potential background content */
            -webkit-backface-visibility: hidden;
            backface-visibility: hidden;
            transform: translateZ(0);
            isolation: isolate;
            z-index: 1;
          }
          .window-content:hover {
            background: rgba(23, 23, 23, 0.95);
          }
          .control-tray {
            position: relative;
            width: 100%;
            padding: 8px;
            box-sizing: border-box;
            z-index: 2;
            background: transparent;
          }
          .control-tray-container {
            position: relative;
            display: flex;
            flex-direction: column;
            gap: 8px;
            z-index: 3;
          }
          .actions-nav {
            position: relative;
            display: flex;
            gap: 4px;
            justify-content: center;
            align-items: center;
            z-index: 4;
            background: transparent;
          }
          .carousel-container {
            position: relative;
            display: flex;
            align-items: center;
            gap: 4px;
            width: 100%;
            padding: 0;
            z-index: 4;
            background: transparent;
          }
          .carousel-content {
            position: relative;
            flex: 1;
            text-align: center;
            justify-content: center;
            display: flex;
            align-items: center;
            z-index: 5;
            background: transparent;
            isolation: isolate;
            transform: translateZ(0);
          }
          .carousel-slide {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 6;
            background: transparent;
            transform: translateZ(0);
            -webkit-font-smoothing: antialiased;
          }
          .carousel-text {
            position: relative;
            color: white;
            font-size: 14px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            padding: 0 4px;
            z-index: 6;
            opacity: 0.9;
            background: transparent;
            mix-blend-mode: normal;
            transform: translateZ(0);
            -webkit-font-smoothing: antialiased;
            will-change: contents;
            text-rendering: optimizeLegibility;
          }
          button, .action-button, .carousel-button {
            -webkit-app-region: no-drag;
          }
          .close-button {
            position: absolute;
            top: 8px;
            right: 8px;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.8);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            font-size: 18px;
            -webkit-app-region: no-drag;
            transition: all 0.2s ease;
            opacity: 0.6;
            z-index: 1000;
            pointer-events: auto;
            transform: translateZ(0);
          }
          .window-content:hover .close-button {
            opacity: 1;
          }
          .close-button:hover {
            background-color: rgba(255, 255, 255, 0.1);
            color: white;
          }
          .close-button .material-symbols-outlined {
            font-size: 16px;
          }
          .material-symbols-outlined {
            font-family: 'Material Symbols Outlined';
            font-weight: normal;
            font-style: normal;
            font-size: 20px;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-block;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
            -webkit-font-smoothing: antialiased;
          }
          .filled {
            font-variation-settings: 'FILL' 1;
          }
          .carousel-button {
            position: relative;
            width: 24px;
            height: 24px;
            background: transparent;
            border: none;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s;
            border-radius: 4px;
            padding: 0;
          }
          .carousel-button:hover {
            background-color: rgba(255, 255, 255, 0.1);
          }
          .window-content:hover .carousel-text {
            opacity: 1;
          }
          .message-overlay {
            display: none;
          }
          .key-button {
            position: absolute;
            top: 8px;
            left: 8px;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.8);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            font-size: 18px;
            -webkit-app-region: no-drag;
            transition: all 0.2s ease;
            opacity: 0.6;
            z-index: 1000;
            pointer-events: auto;
            transform: translateZ(0);
          }
          .window-content:hover .key-button {
            opacity: 1;
          }
          .key-button:hover {
            background-color: rgba(255, 255, 255, 0.1);
            color: white;
          }
          .key-button .material-symbols-outlined {
            font-size: 16px;
          }

          body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: transparent;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            position: relative;
          }

          .error-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
            z-index: 2000;
          }

          .error-overlay.visible {
            opacity: 1;
          }

          .error-message {
            background: #f44336;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            text-align: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          }

          .action-button {
            position: relative;
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            padding: 4px;
            border-radius: 50%;
            transition: all 0.2s ease-in-out;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            z-index: 5;
            mix-blend-mode: normal;
            -webkit-font-smoothing: antialiased;
          }
          .action-button:not(.disabled):hover {
            background-color: rgba(255, 255, 255, 0.1);
          }
          .actions-nav.disabled .action-button:not(.connect-button) {
            opacity: 0.5;
            cursor: not-allowed;
            pointer-events: none;
          }
          .carousel-slide {
            position: relative;
            z-index: 6;
            background: transparent;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            transform: translateZ(0);
            -webkit-font-smoothing: antialiased;
          }
          /* Force hardware acceleration and prevent ghosting */
          * {
            transform: translate3d(0, 0, 0);
            backface-visibility: hidden;
            perspective: 1000;
            transform-style: preserve-3d;
          }

          .marker {
            width: 101px;
            height: 101px;
            background: rgba(255, 0, 0, 0.3);
            border: 2px solid rgba(255, 0, 0, 0.8);
            position: absolute;
            animation: pulse 1s infinite;
            box-sizing: border-box;
          }
          @keyframes pulse {
            0% { opacity: 0.4; }
            50% { opacity: 0.6; }
            100% { opacity: 0.4; }
          }
        </style>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      </head>
      <body>
        <div class="window-content">
          <button class="key-button" title="Settings">
            <span class="material-symbols-outlined">settings</span>
          </button>

          <button class="close-button" title="Close window">
            <span class="material-symbols-outlined">close</span>
          </button>

          <section class="control-tray">
            <div class="control-tray-container">
              <nav class="actions-nav disabled">
                <button class="action-button mic-button">
                  <span class="material-symbols-outlined filled">mic</span>
                </button>

                <button class="action-button screen-button" style="display: none;">
                  <span class="material-symbols-outlined">present_to_all</span>
                </button>

                <button class="action-button webcam-button">
                  <span class="material-symbols-outlined">videocam</span>
                </button>

                <button class="action-button connect-button">
                  <span class="material-symbols-outlined">play_arrow</span>
                </button>
              </nav>

              <div class="carousel-container">
                <button class="carousel-button prev-button">
                  <span class="material-symbols-outlined">chevron_left</span>
                </button>

                <div class="carousel-content">
                  <div id="carousel-text-container" class="carousel-slide">
                    <span id="mode-text" class="carousel-text">Default Mode</span>
                  </div>
                </div>

                <button class="carousel-button next-button">
                  <span class="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        <div class="error-overlay">
          <div class="error-message">API key is required to connect</div>
        </div>

        <script>
          const { ipcRenderer } = require('electron');
          
          const micButton = document.querySelector('.mic-button');
          const screenButton = document.querySelector('.screen-button');
          const webcamButton = document.querySelector('.webcam-button');
          const connectButton = document.querySelector('.connect-button');
          const actionsNav = document.querySelector('.actions-nav');
          const closeButton = document.querySelector('.close-button');
          const prevButton = document.querySelector('.prev-button');
          const nextButton = document.querySelector('.next-button');
          const carouselText = document.querySelector('.carousel-text');
          const settingsButton = document.querySelector('.key-button');
          const errorOverlay = document.querySelector('.error-overlay');
          const errorMessage = errorOverlay.querySelector('.error-message');
          
          let isMuted = false;
          let isScreenSharing = false;
          let isWebcamOn = false;
          let isConnected = false;
          let isConnecting = false;

          // Carousel handlers
          prevButton.addEventListener('click', () => {
            if (isConnected) {
              // If connected, disconnect first
              isConnected = false;
              isConnecting = false;
              connectButton.querySelector('span').textContent = 'play_arrow';
              connectButton.querySelector('span').classList.remove('filled');
              actionsNav.classList.add('disabled');
              // Send disconnect action
              ipcRenderer.send('control-action', { type: 'connect', value: false });
              // Then change carousel
              ipcRenderer.send('carousel-action', 'prev');
            } else {
              ipcRenderer.send('carousel-action', 'prev');
            }
          });

          nextButton.addEventListener('click', () => {
            if (isConnected) {
              // If connected, disconnect first
              isConnected = false;
              isConnecting = false;
              connectButton.querySelector('span').textContent = 'play_arrow';
              connectButton.querySelector('span').classList.remove('filled');
              actionsNav.classList.add('disabled');
              // Send disconnect action
              ipcRenderer.send('control-action', { type: 'connect', value: false });
              // Then change carousel
              ipcRenderer.send('carousel-action', 'next');
            } else {
              ipcRenderer.send('carousel-action', 'next');
            }
          });

          // Handle carousel updates
          ipcRenderer.on('update-carousel', (event, { modeName, requiresDisplay }) => {
            const modeText = document.getElementById('mode-text');
            const container = document.getElementById('carousel-text-container');
            
            // Create a new text element
            const newText = document.createElement('span');
            newText.className = 'carousel-text';
            newText.textContent = modeName;
            
            // Fade out the old text
            modeText.style.opacity = '0';
            
            // After fade out, update the text
            setTimeout(() => {
              modeText.textContent = modeName;
              modeText.style.opacity = '0.9';
            }, 100);
            
            screenButton.style.display = requiresDisplay ? '' : 'none';
            webcamButton.style.display = requiresDisplay ? '' : 'none';
          });

          micButton.addEventListener('click', () => {
            if (!isConnected) return;
            isMuted = !isMuted;
            micButton.querySelector('span').textContent = isMuted ? 'mic_off' : 'mic';
            ipcRenderer.send('control-action', { type: 'mic', value: !isMuted });
          });

          screenButton.addEventListener('click', () => {
            if (!isConnected) return;
            if (isScreenSharing) {
              isScreenSharing = false;
              screenButton.querySelector('span').textContent = 'present_to_all';
              screenButton.querySelector('span').classList.remove('filled');
              ipcRenderer.send('control-action', { type: 'screen', value: false });
            } else {
              ipcRenderer.send('control-action', { type: 'screen', value: true });
            }
          });

          webcamButton.addEventListener('click', () => {
            if (!isConnected) return;
            isWebcamOn = !isWebcamOn;
            webcamButton.querySelector('span').textContent = isWebcamOn ? 'videocam_off' : 'videocam';
            ipcRenderer.send('control-action', { type: 'webcam', value: isWebcamOn });
          });

          // Function to show error message
          function showError(message, duration = 2000) {
            errorMessage.textContent = message;
            errorOverlay.classList.add('visible');
            setTimeout(() => {
              errorOverlay.classList.remove('visible');
            }, duration);
          }

          connectButton.addEventListener('click', async () => {
            if (!isConnected) {
              await ipcRenderer.send('session-start');
              console.log('Session started');
              isConnected = true;
              isConnecting = true;
              connectButton.querySelector('span').textContent = 'pause';
              connectButton.querySelector('span').classList.add('filled');
              actionsNav.classList.remove('disabled');
              ipcRenderer.send('control-action', { type: 'connect', value: true });
            } else {
              isConnected = false;
              isConnecting = false;
              connectButton.querySelector('span').textContent = 'play_arrow';
              connectButton.querySelector('span').classList.remove('filled');
              actionsNav.classList.add('disabled');
              ipcRenderer.send('control-action', { type: 'connect', value: false });
            }
          });

          // Handle API key check response
          ipcRenderer.on('api-key-check', (event, hasApiKey) => {
            if (hasApiKey) {
              ipcRenderer.send('control-action', { type: 'connect', value: !isConnected });
            } else {
              isConnecting = false;
            }
          });

          // Handle screen share result
          ipcRenderer.on('screen-share-result', (event, success) => {
            if (success) {
              isScreenSharing = true;
              screenButton.querySelector('span').textContent = 'cancel_presentation';
              screenButton.querySelector('span').classList.add('filled');
            }
          });

          // Handle state updates from main process
          ipcRenderer.on('update-controls', (event, state) => {
            isMuted = state.isMuted;
            isScreenSharing = state.isScreenSharing;
            isWebcamOn = state.isWebcamOn;
            isConnected = state.isConnected;
            isConnecting = false;

            // Update button states
            micButton.querySelector('span').textContent = isMuted ? 'mic_off' : 'mic';
            screenButton.querySelector('span').textContent = isScreenSharing ? 'cancel_presentation' : 'present_to_all';
            webcamButton.querySelector('span').textContent = isWebcamOn ? 'videocam_off' : 'videocam';
            connectButton.querySelector('span').textContent = isConnected ? 'pause' : 'play_arrow';

            // Update filled states
            micButton.querySelector('span').classList.toggle('filled', !isMuted);
            screenButton.querySelector('span').classList.toggle('filled', isScreenSharing);
            webcamButton.querySelector('span').classList.toggle('filled', isWebcamOn);
            connectButton.querySelector('span').classList.toggle('filled', isConnected);

            // Update disabled state of the nav
            actionsNav.classList.toggle('disabled', !isConnected);
          });

          // Add close button handler
          closeButton.addEventListener('click', () => {
            ipcRenderer.send('close-control-window');
          });

          // Add settings button handler
          settingsButton.addEventListener('click', () => {
            ipcRenderer.send('show-settings');
          });

          // Handle settings update (just enable/disable connect button)
          ipcRenderer.on('settings-updated', (event, hasApiKey) => {
            isConnecting = false;
            if (!hasApiKey) {
              connectButton.querySelector('span').textContent = 'play_arrow';
              connectButton.querySelector('span').classList.remove('filled');
              actionsNav.classList.add('disabled');
            }
          });
        </script>
      </body>
    </html>
  `;

  controlWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  // Wait for window to be ready before showing
  controlWindow.once('ready-to-show', () => {
    // Send initial mode update
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Force a mode update from the main window
      mainWindow.webContents.send('request-mode-update');
    }
  });

  // Handle window close
  controlWindow.on('closed', () => {
    controlWindow = null;
  });

  return controlWindow;
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow; // Return existing window if it's still valid
  }

  overlayWindow = new BrowserWindow({
    width: 800,
    height: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Prevent window from being closed directly
  overlayWindow.on('close', event => {
    event.preventDefault();
    overlayWindow?.hide();
  });

  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: transparent;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          }
          #subtitles {
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 24px;
            font-weight: 500;
            text-align: center;
            max-width: 80%;
            opacity: 0;
            transition: opacity 0.2s ease-in-out;
            position: relative;
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
          }
          #subtitles.visible {
            opacity: 1;
          }
        </style>
      </head>
      <body>
        <div id="subtitles"></div>
        <script>
          const { ipcRenderer } = require('electron');
          const subtitles = document.getElementById('subtitles');
          
          ipcRenderer.on('update-subtitles', (event, text) => {
            if (text) {
              // First remove the visible class to trigger fade out
              subtitles.classList.remove('visible');
              
              // Wait for the fade out transition to complete
              setTimeout(() => {
                subtitles.textContent = text;
                subtitles.style.display = 'block';
                // Force a reflow to ensure the transition works
                subtitles.offsetHeight;
                subtitles.classList.add('visible');
              }, 200);
            } else {
              subtitles.classList.remove('visible');
              setTimeout(() => {
                subtitles.style.display = 'none';
                subtitles.textContent = '';
              }, 200);
            }
          });
        </script>
      </body>
    </html>
  `;

  overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  // Handle window close
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

async function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: true,
    show: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Prevent window from being closed directly
  settingsWindow.on('close', event => {
    event.preventDefault();
    settingsWindow?.hide();
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
        <style>
          :root {
            --primary-color: #2196F3;
            --primary-hover: #1976D2;
            --background: #1a1a1a;
            --surface: #2d2d2d;
            --text: #ffffff;
            --text-secondary: rgba(255, 255, 255, 0.7);
            --border: rgba(255, 255, 255, 0.1);
            --spacing-xs: 4px;
            --spacing-sm: 8px;
            --spacing-md: 16px;
            --spacing-lg: 24px;
            --spacing-xl: 32px;
          }

          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          }

          body {
            background: var(--background);
            color: var(--text);
            min-height: 100vh;
            line-height: 1.5;
            font-size: 14px;
          }

          .container {
            height: 100vh;
            display: grid;
            grid-template-rows: auto 1fr auto;
          }

          .header {
            padding: var(--spacing-lg) var(--spacing-xl);
            background: var(--surface);
            border-bottom: 1px solid var(--border);
            text-align: center;
            height: 50px;
          }

          .header h1 {
            font-size: 20px;
            color: var(--text);
            margin: -10px;
          }

          .content {
            padding: var(--spacing-xl);
            overflow-y: auto;
          }

          .settings-section {
            max-width: 100%;
            margin: 0 auto;
          }

          .settings-group {
            background: var(--surface);
            border-radius: 12px;
            padding: var(--spacing-lg);
            margin-bottom: var(--spacing-lg);
          }

          .form-group {
            margin-bottom: var(--spacing-lg);
          }

          .form-group:last-child {
            margin-bottom: 0;
          }

          .form-label {
            display: block;
            margin-bottom: var(--spacing-sm);
            color: var(--text);
            font-weight: 500;
          }

          .input-group {
            display: flex;
            gap: var(--spacing-md);
            align-items: center;
          }

          .form-input {
            flex: 1;
            padding: 10px 12px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border);
            border-radius: 8px;
            color: var(--text);
            font-size: 14px;
            transition: all 0.2s ease;
          }

          .form-input:focus {
            outline: none;
            border-color: var(--primary-color);
            background: rgba(255, 255, 255, 0.1);
          }

          .form-input::placeholder {
            color: var(--text-secondary);
          }

          .help-link {
            display: inline-flex;
            align-items: center;
            padding: 8px 12px;
            color: var(--primary-color);
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            transition: all 0.2s ease;
          }

          .help-link:hover {
            background: rgba(33, 150, 243, 0.1);
          }

          .help-link svg {
            margin-left: var(--spacing-xs);
          }

          .actions {
            display: flex;
            justify-content: flex-end;
            height: 50px;
            align-items: center;
            justify-content: center;
            gap: var(--spacing-md);
            padding: var(--spacing-lg) var(--spacing-xl);
            background: var(--surface);
            border-top: 1px solid var(--border);
          }

          .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            color: var(--text);
          }

          .btn-secondary:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.15);
          }

          .btn-primary {
            background: var(--primary-color);
            color: white;
          }

          .btn-primary:hover:not(:disabled) {
            background: var(--primary-hover);
          }

          .version-info {
            display: flex;
            align-items: center;
            gap: var(--spacing-md);
          }

          .version-text {
            color: var(--text-secondary);
            font-size: 14px;
          }

          .check-update-btn {
            background: var(--primary-color);
            border: none;
            color: white;
            font-size: 14px;
            cursor: pointer;
            padding: 8px 16px;
            border-radius: 6px;
            transition: all 0.2s ease;
            font-weight: 500;
          }

          .check-update-btn:hover {
            background: var(--primary-hover);
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .settings-section {
            animation: fadeIn 0.3s ease;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <header class="header">
            <h1>Settings</h1>
          </header>

          <main class="content">
            <div class="settings-section">
              <form id="settings-form">
                <div class="settings-group">                  
                  <div class="form-group">
                    <label class="form-label" for="gemini-api-key-input">Gemini API Key</label>
                    <div class="input-group">
                      <input
                        type="password"
                        id="gemini-api-key-input"
                        placeholder="Enter your API key"
                        class="form-input"
                      />
                      <a href="https://aistudio.google.com/apikey" 
                         target="_blank" 
                         class="help-link"
                      >
                        Get API key
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 8.66667V12.6667C12 13.0203 11.8595 13.3594 11.6095 13.6095C11.3594 13.8595 11.0203 14 10.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V5.33333C2 4.97971 2.14048 4.64057 2.39052 4.39052C2.64057 4.14048 2.97971 4 3.33333 4H7.33333" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                          <path d="M10 2H14V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                          <path d="M6.66666 9.33333L14 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>

                <div class="settings-group">
                  <div class="form-group">
                    <label class="form-label">Application Version</label>
                    <div class="version-info">
                      <span class="version-text">Version ${app.getVersion()}</span>
                      <div style="flex: 1"></div>
                      <button type="button" class="check-update-btn" onclick="checkForUpdates()">Check for Updates</button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </main>

          <footer class="actions">
            <button type="button" id="cancel-button" class="btn btn-secondary">Cancel</button>
            <button type="submit" id="save-button" form="settings-form" class="btn btn-primary">Save Changes</button>
          </footer>
        </div>

        <script>
          const { ipcRenderer } = require('electron');
          
          const form = document.getElementById('settings-form');
          const geminiApiKeyInput = document.getElementById('gemini-api-key-input');
          const saveButton = document.getElementById('save-button');
          const cancelButton = document.getElementById('cancel-button');

          // Initialize with current API keys
          ipcRenderer.on('init-settings', (event, { geminiApiKey }) => {
            geminiApiKeyInput.value = geminiApiKey || '';
            saveButton.disabled = !geminiApiKey;
          });

          // Enable/disable save button based on input
          const checkInputs = () => {
            const hasGeminiKey = geminiApiKeyInput.value.trim();
            saveButton.disabled = !hasGeminiKey;
          };
          
          geminiApiKeyInput.addEventListener('input', checkInputs);

          // Handle form submission
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            const geminiApiKey = geminiApiKeyInput.value.trim();
            if (geminiApiKey) {
              ipcRenderer.send('save-settings', { geminiApiKey });
            }
          });

          // Handle cancel button
          cancelButton.addEventListener('click', () => {
            ipcRenderer.send('close-settings');
          });

          // Handle check for updates
          function checkForUpdates() {
            ipcRenderer.send('check-for-update');
          }
        </script>
      </body>
    </html>
  `;

  settingsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  settingsWindow.once('ready-to-show', () => {
    if (settingsWindow) {
      settingsWindow.show();
      // Initialize settings with saved data
      const savedSettings = loadSettings();
      settingsWindow.webContents.send('init-settings', savedSettings);
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

// Update show-settings handler to not show main window
ipcMain.on('show-settings', async () => {
  await createSettingsWindow();
});

// Handle API key check
ipcMain.on('check-api-key', async event => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // Create a promise to wait for the API key check result
  const hasApiKey = await new Promise(resolve => {
    // We know mainWindow is not null here
    (mainWindow as BrowserWindow).webContents.send('check-api-key');
    const handleApiKeyCheck = (_: any, result: boolean) => {
      ipcMain.removeListener('api-key-check-result', handleApiKeyCheck);
      resolve(result);
    };
    ipcMain.on('api-key-check-result', handleApiKeyCheck);
  });

  if (!hasApiKey) {
    // Show settings directly if no API key
    await createSettingsWindow();
  }
});

// Handle API key check result
ipcMain.on('api-key-check-result', (event, hasApiKey) => {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send('api-key-check', hasApiKey);
  }
});

// Add handler for logging to file
ipcMain.on('log-to-file', (event, message) => {
  logToFile(message);
});

// Add new IPC handlers for settings window
ipcMain.on('settings-data', (event, settings) => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('init-settings', settings);
  }
});

ipcMain.on('save-settings', (event, settings) => {
  // Save settings to file
  saveSettings(settings);

  // Send settings to main window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-settings', settings);
  }

  // Just notify control window about API key availability without starting session
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send('settings-updated', settings.apiKey);
  }

  // Close settings window
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.hide();
  }
});

ipcMain.on('close-settings', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
});

// Initialize app with saved settings
async function initializeApp() {
  // Load saved settings first
  const savedSettings = loadSettings();

  // Create windows
  await createMainWindow();
  createOverlayWindow();
  createControlWindow();
  console.log('App is ready. Listening for global mouse events...');

  // Send saved settings to main window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('init-saved-settings', savedSettings);
  }
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

// Update main window close handler to clean up other windows
ipcMain.on('close-main-window', () => {
  if (mainWindow) {
    // Clean up all windows when main window is closed
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.close();
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }
    mainWindow.close();
  }
});

// Update subtitle handlers to check for destroyed windows
ipcMain.on('update-subtitles', (event, text) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('update-subtitles', text);
    if (text) {
      overlayWindow.showInactive();
    } else {
      overlayWindow.hide();
    }
  }
});

ipcMain.on('remove_subtitles', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
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

// ipcMain.on('click', async (event, x: number, y: number) => {
//   try {
//     // Move mouse to coordinates and click
//     await mouse.setPosition(new Point(x, y));
//     await mouse.leftClick();
//     logToFile(`Clicked at coordinates: x=${x}, y=${y}`);
//   } catch (error) {
//     logToFile(`Error performing click: ${error}`);
//     console.log("error performing click", error);
//   }
// });

ipcMain.on('select-content', async (event, x1: number, y1: number, x2: number, y2: number) => {
  try {
    // Move to start position
    await mouse.setPosition(new Point(x1, y1));

    await new Promise(resolve => setTimeout(resolve, 50));
    // Press and hold left mouse button
    await mouse.pressButton(0); // 0 is left button in nut-js
    // Small delay to ensure button press registered
    await new Promise(resolve => setTimeout(resolve, 50));
    // Move to end position
    await mouse.setPosition(new Point(x2, y2));
    // Small delay before release
    await new Promise(resolve => setTimeout(resolve, 50));
    // Release left mouse button
    await mouse.releaseButton(0);

    await new Promise(resolve => setTimeout(resolve, 50));

    const modifier = process.platform === 'darwin' ? Key.LeftCmd : Key.LeftControl;
    await keyboard.pressKey(modifier, Key.C);
    await keyboard.releaseKey(modifier, Key.C);

    logToFile(`Selected content from (${x1},${y1}) to (${x2},${y2})`);
  } catch (error) {
    logToFile(`Error selecting content: ${error}`);
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

ipcMain.on('scroll', async (event, direction: string, amount: number = 200) => {
  try {
    if (direction === 'up') {
      await mouse.scrollUp(amount);
    } else if (direction === 'down') {
      await mouse.scrollDown(amount);
    }
  } catch (error) {
    logToFile(`Error scrolling: ${error}`);
  }
});

// Update the control-action handler to handle all cases
ipcMain.on('control-action', async (event, action) => {
  try {
    // Create main window if it doesn't exist for any control action
    if (!mainWindow || mainWindow.isDestroyed()) {
      await createMainWindow();
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      // Show window if screen sharing is being activated
      if (action.type === 'screen' && action.value === true) {
        mainWindow.show();
        mainWindow.focus();
      }
      // Hide window if screen sharing is being deactivated
      else if (action.type === 'screen' && action.value === false) {
        mainWindow.hide();
      }
      // Show window if webcam is being activated
      else if (action.type === 'webcam' && action.value === true) {
        mainWindow.show();
        mainWindow.focus();
      }
      // else if (action.type === 'connect' && action.value === true) {
      //   if (!customSessionName) {
      //     // Only prompt for name if not already set
      //     mainWindow?.webContents.send('prompt-session-name');
      //   }
      // }
      mainWindow.webContents.send('control-action', action);
    }
  } catch (error) {
    logToFile(`Error handling control action: ${error}`);
    event.reply('control-action-error', {
      error: 'Failed to process control action',
    });
  }
});

// Add this to handle state updates from the main window
ipcMain.on('update-control-state', (event, state) => {
  try {
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.webContents.send('update-controls', state);
    }
  } catch (error) {
    logToFile(`Error updating control state: ${error}`);
  }
});

// Add this to handle screen selection result
ipcMain.on('screen-share-result', (event, success) => {
  try {
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.webContents.send('screen-share-result', success);
      // If screen sharing failed, hide the main window
      if (!success && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
      }
    }
  } catch (error) {
    logToFile(`Error handling screen share result: ${error}`);
  }
});

// Add this to handle carousel actions
ipcMain.on('carousel-action', async (event, direction) => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      await createMainWindow();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('carousel-action', direction);
    }
  } catch (error) {
    logToFile(`Error handling carousel action: ${error}`);
  }
});

// Add this to handle carousel updates
ipcMain.on('update-carousel', (event, modeName) => {
  try {
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.webContents.send('update-carousel', modeName);
    }
  } catch (error) {
    logToFile(`Error updating carousel: ${error}`);
  }
});

// Add this to handle control window close
ipcMain.on('close-control-window', event => {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.close();
  }
});

// Add this after the other ipcMain handlers
ipcMain.on('paste-content', async (event, content) => {
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
    logToFile(`Error pasting content: ${error}`);
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

// Add this with other IPC handlers
ipcMain.handle('get-selected-text', async () => {
  return await getSelectedText();
});

// Add this with other IPC handlers
ipcMain.on('show-main-window', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.on('hide-main-window', () => {
  if (mainWindow) {
    mainWindow.hide();
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

// Modified handler for setting session name
ipcMain.on('set-action-name', (event, name) => {
  try {
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_ ]/g, '_');
    customSessionName = sanitizedName.trim().toLowerCase();

    // Initialize or overwrite the session in the conversations file
    const conversations = loadConversations();
    if (customSessionName) {
      // Overwrite the existing array or create a new one
      conversations[customSessionName] = [];
      saveConversations(conversations);
      logToFile(`Set/Reset session name: ${customSessionName}`);
    }
  } catch (error) {
    logToFile(`Error setting session name: ${error}`);
  }
});

// Modified record-conversation handler
ipcMain.on('record-conversation', (event, function_call, description, payload = '') => {
  try {
    if (!customSessionName) {
      logToFile('No session name set, cannot record conversation');
      return;
    }

    const conversations = loadConversations();
    const sessionName = customSessionName;

    if (!conversations[sessionName]) {
      conversations[sessionName] = [];
    }

    const filepath = '';
    conversations[sessionName].push({
      function_call,
      description,
      filepath,
      payload,
    });

    saveConversations(conversations);
    logToFile(`Recorded conversation for session: ${sessionName}`);
  } catch (error) {
    logToFile(`Error recording conversation: ${error}`);
  }
});

// Reset only the session name when app starts or restarts
app.on('ready', () => {
  customSessionName = null;
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
      // Execute the actions
      // for (let action of actions) {
      //   switch (action.function_call) {
      //     case "click":
      //       if (action.args && action.args.x !== undefined && action.args.y !== undefined) {
      //         await mouse.setPosition(new Point(action.args.x, action.args.y));
      //         await mouse.leftClick();
      //       }
      //       break;
      //     case "select_content":
      //       if (action.args && action.args.x1 !== undefined && action.args.y1 !== undefined &&
      //         action.args.x2 !== undefined && action.args.y2 !== undefined) {
      //         await mouse.setPosition(new Point(action.args.x1, action.args.y1));
      //         await mouse.pressButton(0);
      //         await mouse.setPosition(new Point(action.args.x2, action.args.y2));
      //         await mouse.releaseButton(0);
      //         await keyboard.pressKey(modifier, Key.C);
      //         await keyboard.releaseKey(modifier, Key.C);
      //       }
      //       break;
      //     case "scroll":
      //       if (action.args && action.args.direction && action.args.amount !== undefined) {
      //         if (action.args.direction === "up") {
      //           await mouse.scrollUp(action.args.amount);
      //         } else if (action.args.direction === "down") {
      //           await mouse.scrollDown(action.args.amount);
      //         }
      //       }
      //       break;
      //     case "insert_content":
      //       if (action.args && action.args.x !== undefined && action.args.y !== undefined) {
      //         await mouse.setPosition(new Point(action.args.x, action.args.y));
      //         await mouse.leftClick();
      //         await new Promise(resolve => setTimeout(resolve, 50));
      //         await keyboard.pressKey(modifier, Key.V);
      //         await keyboard.releaseKey(modifier, Key.V);
      //       }
      //       break;
      //   }
      //   await new Promise(resolve => setTimeout(resolve, action.delay));
      // }
      // return actionData;
    } else {
      logToFile(`No action data found for: ${actionName}`);
      return null;
    }
  } catch (error) {
    logToFile(`Error getting action data: ${error}`);
    return null;
  }
});

function showCoordinateMarker(x: number, y: number) {
  if (markerWindow && !markerWindow.isDestroyed()) {
    markerWindow.close();
  }

  // Adjust window size to be smaller since we're showing a smaller marker
  const markerSize = 20; // Diameter (2 * radius)
  markerWindow = new BrowserWindow({
    width: markerSize,
    height: markerSize,
    x: x - markerSize / 2, // Center the marker on the coordinates
    y: y - markerSize / 2,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const markerHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: transparent;
          }
          .marker {
            width: 20px;
            height: 20px;
            background: rgba(255, 0, 0, 0.3);
            border: 2px solid rgba(255, 0, 0, 0.8);
            position: absolute;
            animation: pulse 1s infinite;
            box-sizing: border-box;
            border-radius: 50%; /* Make it circular */
          }
          @keyframes pulse {
            0% { opacity: 0.4; }
            50% { opacity: 0.6; }
            100% { opacity: 0.4; }
          }
        </style>
      </head>
      <body>
        <div class="marker"></div>
        <script>
          // Auto-close after 10 seconds
          setTimeout(() => window.close(), 10000);
        </script>
      </body>
    </html>
  `;

  markerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(markerHtml)}`);
  markerWindow.setIgnoreMouseEvents(true);
}

function showBoxMarker(x1: number, y1: number, x2: number, y2: number) {
  if (markerWindow && !markerWindow.isDestroyed()) {
    markerWindow.close();
  }

  const width = x2 - x1;
  const height = y2 - y1;

  markerWindow = new BrowserWindow({
    width: width,
    height: height,
    x: x1,
    y: y1,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const markerHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: transparent;
          }
          .box-marker {
            width: 100%;
            height: 100%;
            background: rgba(255, 0, 0, 0.2);
            border: 2px solid rgba(255, 0, 0, 0.8);
            position: absolute;
            animation: pulse 1s infinite;
            box-sizing: border-box;
          }
          @keyframes pulse {
            0% { opacity: 0.4; }
            50% { opacity: 0.6; }
            100% { opacity: 0.4; }
          }
        </style>
      </head>
      <body>
        <div class="box-marker"></div>
        <script>
          // Auto-close after 5 seconds
          setTimeout(() => window.close(), 5000);
        </script>
      </body>
    </html>
  `;

  markerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(markerHtml)}`);
  markerWindow.setIgnoreMouseEvents(true);
}

// Add IPC handler for showing coordinates
ipcMain.on('show-coordinates', (_, x: number, y: number) => {
  showCoordinateMarker(x, y);
});

// Add IPC handler for showing bounding box
ipcMain.on('show-box', (_, x1: number, y1: number, x2: number, y2: number) => {
  showBoxMarker(x1, y1, x2, y2);
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

// Add screenshot saving handler
ipcMain.on(
  'record-opencv-action',
  async (event, base64Data, function_call, description, payload = '', timeSinceLastAction = 0) => {
    try {
      // Hide cursor before taking screenshot
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('set-cursor-visibility', 'none');
      });

      // Add a small delay to ensure cursor is hidden
      await new Promise(resolve => setTimeout(resolve, 100));

      if (!customSessionName) {
        logToFile('No session name set, cannot record conversation');
        return;
      }

      const conversations = loadConversations();
      const sessionName = customSessionName;

      if (!conversations[sessionName]) {
        conversations[sessionName] = [];
      }

      saveConversations(conversations);
      logToFile(`Recorded conversation for session: ${sessionName}`);

      logToFile('Starting screenshot save process');
      // Create screenshots directory if it doesn't exist
      const screenshotsDir = path.join(
        app.getPath('appData'),
        'screensense-ai',
        'actions',
        sessionName
      );
      if (!fs.existsSync(screenshotsDir)) {
        logToFile(`Creating screenshots directory at: ${screenshotsDir}`);
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `screenshot-${timestamp}.png`;
      const filepath = path.join(screenshotsDir, filename);
      logToFile(`Generated filepath: ${filepath}`);

      // Convert base64 to buffer and save
      const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Image, 'base64');
      logToFile(`Created image buffer of size: ${imageBuffer.length} bytes`);

      fs.writeFileSync(filepath, imageBuffer);
      logToFile(`Screenshot saved successfully`);

      conversations[sessionName].push({
        function_call,
        description,
        filepath,
        payload,
        timeSinceLastAction,
      });
      saveConversations(conversations);
      logToFile(
        `Recorded conversation for session: ${sessionName} with time since last action: ${timeSinceLastAction}ms`
      );

      // Show cursor after screenshot is saved
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('set-cursor-visibility', 'default');
      });

      return filepath;
    } catch (error) {
      // Show cursor even if there's an error
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('set-cursor-visibility', 'default');
      });

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logToFile(`Error saving screenshot: ${errorMessage}`);
      console.error('Error saving screenshot:', error);
      throw error;
    }
  }
);

// Add this with other ipcMain handlers
ipcMain.handle('get-window-dimensions', () => {
  const primaryDisplay = electron_screen.getPrimaryDisplay();
  const { bounds, workArea, scaleFactor } = primaryDisplay;
  return {
    bounds: bounds,
    workArea: workArea,
    scaleFactor: scaleFactor,
  };
});

// Add mouse position handler
ipcMain.handle('get-mouse-position', () => {
  const mousePosition = electron_screen.getCursorScreenPoint();
  return mousePosition;
});

// Add IPC handlers for cursor visibility
ipcMain.handle('hide-cursor', () => {
  // Send message to renderer to hide cursor via CSS
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('set-cursor-visibility', 'none');
  });
});

ipcMain.handle('show-cursor', () => {
  // Send message to renderer to show cursor via CSS
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('set-cursor-visibility', 'default');
  });
});

// Add system-level cursor visibility handlers
ipcMain.handle('hide-system-cursor', async () => {
  try {
    // Store current mouse position
    const currentPos = electron_screen.getCursorScreenPoint();

    // Move cursor off screen temporarily
    await mouse.setPosition(new Point(-10000, -10000));

    return currentPos;
  } catch (error) {
    console.error('Error hiding system cursor:', error);
    return null;
  }
});

ipcMain.handle('restore-system-cursor', async (_, position: { x: number; y: number }) => {
  try {
    // Restore cursor to original position
    await mouse.setPosition(new Point(position.x, position.y));
  } catch (error) {
    console.error('Error restoring system cursor:', error);
  }
});

// Add function to process image with OmniParser
// async function processImageWithOmniParser(imagePath: string) {
//   try {
//     logToFile(`Processing image with OmniParser: ${imagePath}`);

//     // Read the PNG file into a buffer
//     const imageBuffer = fs.readFileSync(imagePath);

//     // Create a Blob with the correct MIME type
//     const imageBlob = new Blob([imageBuffer], { type: 'image/png' });

//     // Process the image with OmniParser
//     const result = await omniParser.detectElements(imageBlob);

//     // Log the results
//     logToFile('OmniParser detection results:');
//     if (result && result.data && result.data[1]) {
//       logToFile('Detected elements:');
//       result.data[1].forEach((element, index: number) => {
//         logToFile(`\nElement ${index + 1}:`);
//         logToFile(`Type: ${element.type}`);
//         logToFile(`Content: ${element.content}`);
//         logToFile(`Interactive: ${element.interactivity}`);
//         logToFile(`Position: (${element.center.x}, ${element.center.y})`);
//         logToFile(`Bounding Box: (${element.boundingBox.x1}, ${element.boundingBox.y1}) to (${element.boundingBox.x2}, ${element.boundingBox.y2})`);
//       });
//     } else {
//       logToFile('No detection results available');
//     }

//     return result;
//   } catch (error) {
//     const errorMessage = error instanceof Error ? error.message : 'Unknown error';
//     logToFile(`Error processing image with OmniParser: ${errorMessage}`);
//     throw error;
//   }
// }

async function createActionWindow() {
  if (actionWindow && !actionWindow.isDestroyed()) {
    return actionWindow;
  }

  actionWindow = new BrowserWindow({
    width: 120, // Slightly wider than image to account for padding
    height: 150, // Height for image plus text and padding
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    focusable: false, // Prevents the window from taking focus
    skipTaskbar: true, // Keeps it out of the taskbar
    type: 'toolbar', // Makes it appear above most system windows
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Allow loading local resources
    },
  });

  // Ensure window stays on top even when other windows request always-on-top
  actionWindow.setAlwaysOnTop(true, 'screen-saver');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' file: data:">
        <style>
          body {
            margin: 0;
            padding: 12px;
            background: rgba(28, 28, 32, 0.95);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            border-radius: 12px;
            overflow: hidden;
            -webkit-app-region: drag;
            user-select: none;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          #action-image {
            width: 100px;
            height: 100px;
            object-fit: contain;
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.2);
            padding: 4px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            transition: all 0.2s ease;
          }
          #action-image:hover {
            transform: scale(1.02);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
          }
          #action-text {
            color: rgba(255, 255, 255, 0.9);
            font-size: 13px;
            font-weight: 500;
            text-align: center;
            margin: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100px;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
            letter-spacing: 0.2px;
          }
        </style>
      </head>
      <body>
        <img id="action-image" src="" alt="Action preview" />
        <p id="action-text"></p>
        <script>
          const { ipcRenderer } = require('electron');
          
          ipcRenderer.on('update-action', (event, { imagePath, text }) => {
            console.log('Updating action window:', { imagePath, text });
            document.getElementById('action-image').src = imagePath;
            document.getElementById('action-text').textContent = text;
          });
        </script>
      </body>
    </html>
  `;

  actionWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  actionWindow.setIgnoreMouseEvents(true);

  actionWindow.on('closed', () => {
    actionWindow = null;
  });

  return actionWindow;
}

// Add IPC handler to show action window with image and text
ipcMain.on('show-action', async () => {
  const window = await createActionWindow();
  if (window && !window.isDestroyed()) {
    // Get the primary display dimensions
    const primaryDisplay = electron_screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // Get window size
    const windowBounds = window.getBounds();

    // Calculate position (right bottom with 20px padding)
    const x = screenWidth - windowBounds.width - 20;
    const y = screenHeight - windowBounds.height - 20;

    window.setPosition(x, y);
    window.showInactive(); // Use showInactive to prevent focus
  }
});

// Add IPC handler to update action window content
ipcMain.on('update-action', async (event, { imagePath, text }) => {
  if (actionWindow && !actionWindow.isDestroyed()) {
    // Convert local path to file URL
    const fileUrl = `file://${imagePath.replace(/\\/g, '/')}`;
    actionWindow.webContents.send('update-action', {
      imagePath: fileUrl,
      text,
    });
  }
});

// Add IPC handler to hide action window
ipcMain.on('hide-action', () => {
  if (actionWindow && !actionWindow.isDestroyed()) {
    actionWindow.hide();
  }
});

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

// Add this handler with the other ipcMain handlers
ipcMain.handle('create_template', async (event, title) => {
  try {
    const session = createPatentSession(title);

    // Create markdown file
    const mdPath = path.join(session.path, 'main.md');
    let initialMd = `# ${title}\n\n`;
    // for (const section of patentGeneratorTemplate.sections) {
    //   initialMd += `## ${section.name}\n${section.details}\n\n`;
    // }
    fs.writeFileSync(mdPath, initialMd);

    // Create JSON state tracker
    // const jsonPath = path.join(session.path, 'metadata.json');
    // const template = {
    //   ...patentGeneratorTemplate,
    //   title: title,
    // };
    // fs.writeFileSync(jsonPath, JSON.stringify(template, null, 2));

    // Create assets directory
    fs.mkdirSync(path.join(session.path, 'assets'), { recursive: true });

    logToFile(`Created patent template at: ${session.path}`);
    return { success: true, path: session.path };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logToFile(`Error creating patent template: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
});

// Add handler for getting next unanswered section
ipcMain.handle('get_next_question', async event => {
  try {
    const session = getCurrentSession();
    const mdPath = path.join(session.path, 'main.md');

    if (!fs.existsSync(mdPath)) {
      return { success: false, error: 'Template file not found' };
    }

    // const template = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as PatentTemplate;
    // let content = '';
    // for (const section of template.sections) {
    //   if (section.completed === true) {
    //     content
    //   }
    // }

    // const nextSection = template.sections.find((s: PatentSection) => s.completed !== true);

    // if (!nextSection) {
    //   return { success: true, section: null }; // All sections are completed
    // }

    // return { success: true, section: nextSection };
    // const contents = fs.readFileSync(mdPath, 'utf8');
    // return { success: true, contents };
    const mdContent = fs.readFileSync(mdPath, 'utf8');
    const prompt = `
You are a an expert at creating patents.
Your task is to find the correct question to ask the user to help them document their invention.

<instructions>
- You are provided with a partial markdown document that contains the information provided by the user so far.
- You are also provided with a base checklist of what all information needs to be documented for a patent. Note that this is not exhaustive, this is just a starting point. You are free to ask whatever questions you think are required.
- You must return the question that you think is the most important to ask the user next.
- Your response must be a json format explaining why you think another question is required, and what that question is. If you think no more questions are required, return an empty string.
- Only ask one question at a time. Do not ask multiple questions in one go.
- If you feel the content in the checklist is more or less covered by the existing document, do not ask any more questions. Only ask questions that are absolutely necessary.
</instructions>

<existing_markdown>
${mdContent}
</existing_markdown>

<base_checklist>
${patentGeneratorTemplate.sections.map(section => section.name + '\n' + section.details).join('\n\n')}
</base_checklist>

Your output must be a JSON object with the following format:
{
    "question_required_reasoning": "<explanation of why you think more questions are required to be asked or why you think all questions have been answered>",
    "question_required": true if you think a question is required, false otherwise,
    "question": "<the question that you think is the most important to ask the user next, or an empty string if no more questions are required>"
}
`;
    console.log(`Going to ask anthropic for the next question`);
    const response = await anthropic_completion(
      prompt,
      process.env.REACT_APP_ANTHROPIC_API_KEY!!,
      true
    );
    console.log(`Received response from anthropic: ${response}`);
    const jsonResponse = JSON.parse(response);
    if (!jsonResponse.question_required) {
      return {
        success: true,
        question: `No further questions are required.\n\n${jsonResponse.question_required_reasoning}`,
      };
    } else {
      return {
        success: true,
        question: jsonResponse.question,
      };
    }

    // // Update section completion status in metadata
    // const template = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    // const sectionIndex = template.sections.findIndex((s: PatentSection) => s.name === section);
    // if (sectionIndex !== -1) {
    //   template.sections[sectionIndex].completed = true;
    //   fs.writeFileSync(jsonPath, JSON.stringify(template, null, 2));
    // }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logToFile(`Error getting next question: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
});

// Update the add_content handler to mark sections as completed
ipcMain.handle('add_content', async (event, { content, section }) => {
  try {
    const session = getCurrentSession();
    const mdPath = path.join(session.path, 'main.md');

    // Update markdown content
    let mdContent = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '';

    const prompt = `
You are a an expert at creating patents.
Your task is to update an existing partial markdown document with new information.

<instructions>
- Your language must be suitable for a patent document. Be thorough and detailed.
- You must return the entire updated markdown document.
- You must try to add the new information in the section that is provided, but if it doesn't fit, create a new section.
- Do not add questions to the document.
- If the content includes a path to an image, insert the image in the markdown file by referencing the path.
- If the new information is already present in the document, do not add it again.
- If the information gives rise to new questions, add them to the document.
- Do not modify any sections that you are not updating.
- ALWAYS return the entire updated markdown document. Even if a lot of the document is unchanged, you must return the entire document. NEVER say stuff like [Previous sections remain unchanged] or [same until here] or anything like that. ALWAYS return the entire document.
</instructions>

<existing_markdown>
${mdContent}
</existing_markdown>

<new_content>
${content}
</new_content>

<section>
${section}
</section>
`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: 'o3-mini',
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 100000,
    });

    const updatedContent = response.choices[0].message.content!!;
    fs.writeFileSync(mdPath, updatedContent);

    // Send content update to markdown preview window if it's open
    if (markdownPreviewWindow && !markdownPreviewWindow.isDestroyed()) {
      const basePath = path.dirname(mdPath);
      markdownPreviewWindow.webContents.send('markdown-content-update', {
        content: updatedContent,
        basePath,
      });
    }

    updateSessionModified();
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logToFile(`Error updating markdown: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
});

// Update the display_patent handler
ipcMain.handle('display_patent', async event => {
  try {
    const session = getCurrentSession();
    const mdPath = path.join(session.path, 'main.md');

    logToFile(`Attempting to open patent file in preview: ${mdPath}`);

    if (!fs.existsSync(mdPath)) {
      return { success: false, error: 'Patent file not found' };
    }

    // Instead of shell.openPath, use our markdown preview
    await createMarkdownPreviewWindow(mdPath);
    logToFile(`Successfully opened patent file in preview: ${mdPath}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logToFile(`Error displaying patent: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
});

// Update the read_patent handler
ipcMain.handle('read_patent', async event => {
  try {
    const session = getCurrentSession();
    const mdPath = path.join(session.path, 'main.md');

    if (!fs.existsSync(mdPath)) {
      return { success: false, error: 'Patent file not found' };
    }

    const contents = fs.readFileSync(mdPath, 'utf8');
    return { success: true, contents };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logToFile(`Error reading patent: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
});

// Add function to get patent directory path
function getPatentDir(filename: string) {
  const patentsDir = path.join(app.getPath('appData'), 'screensense-ai', 'patents', filename);
  if (!fs.existsSync(patentsDir)) {
    fs.mkdirSync(patentsDir, { recursive: true });
  }
  return patentsDir;
}

// Add types for session management
interface PatentSession {
  id: string;
  title: string;
  path: string;
  createdAt: Date;
  lastModified: Date;
}

// Add with other global variables
let currentPatentSession: PatentSession | null = null;

// Add functions for session management
function getSessionStorePath() {
  return path.join(app.getPath('appData'), 'screensense-ai', 'session-store.json');
}

function saveSession() {
  const storePath = getSessionStorePath();
  try {
    fs.writeFileSync(storePath, JSON.stringify(currentPatentSession, null, 2));
    logToFile('Session saved successfully');
  } catch (error) {
    logToFile(`Error saving session: ${error}`);
  }
}

function loadSession() {
  const storePath = getSessionStorePath();
  try {
    if (fs.existsSync(storePath)) {
      const data = fs.readFileSync(storePath, 'utf8');
      const session = JSON.parse(data);
      // Rehydrate dates
      session.createdAt = new Date(session.createdAt);
      session.lastModified = new Date(session.lastModified);
      currentPatentSession = session;
      logToFile('Session loaded successfully');
    }
  } catch (error) {
    logToFile(`Error loading session: ${error}`);
    currentPatentSession = null;
  }
}

// Modify createPatentSession to include timestamps and persistence
function createPatentSession(title: string): PatentSession {
  const sessionId = randomUUID();
  const patentDir = getPatentDir(sessionId);
  const now = new Date();

  currentPatentSession = {
    id: sessionId,
    title,
    path: patentDir,
    createdAt: now,
    lastModified: now,
  };

  saveSession();
  return currentPatentSession;
}

// Modify getCurrentSession to handle missing sessions
function getCurrentSession(): PatentSession {
  if (!currentPatentSession) {
    loadSession();
    if (!currentPatentSession) {
      throw new Error('No active patent session');
    }
  }
  return currentPatentSession;
}

// Add function to update last modified time
function updateSessionModified() {
  if (currentPatentSession) {
    currentPatentSession.lastModified = new Date();
    saveSession();
  }
}

// Add screenshot handling for patents
ipcMain.handle('save_patent_screenshot', async (event, { screenshot, description }) => {
  try {
    // Get current session to find the patent directory
    const session = getCurrentSession();
    if (!session) {
      return { success: false, error: 'No active patent session' };
    }

    // Create assets directory if it doesn't exist
    const assetsDir = path.join(session.path, 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    // Create a safe filename from the description
    const safeDescription = description.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${safeDescription}-${timestamp}.png`;
    const filepath = path.join(assetsDir, filename);

    // Save the screenshot
    // Remove the data URL prefix (e.g., "data:image/png;base64,")
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
    await fs.promises.writeFile(filepath, base64Data, 'base64');

    // Update session modified time
    updateSessionModified();

    // Return success with the relative path from the patent directory
    return {
      success: true,
      path: `assets/${filename}`, // Return relative path for markdown linking
    };
  } catch (error) {
    console.error('Error saving screenshot:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error saving screenshot',
    };
  }
});

// Add this before the createUpdateWindow function
(global as any).createUpdateWindow = createUpdateWindow;

async function createUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.show();
    return updateWindow;
  }

  updateWindow = new BrowserWindow({
    width: 400,
    height: 200,
    frame: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const isDev = !app.isPackaged;
  let loadUrl: string;
  if (isDev) {
    loadUrl = 'http://localhost:3000/update.html';
  } else {
    const basePath = app.getAppPath().replace('.asar', '.asar.unpacked');
    const indexPath = path.join(basePath, 'build', 'update.html');
    loadUrl = `file://${indexPath}`;
  }

  await updateWindow.loadURL(loadUrl);
  updateWindow.on('closed', () => {
    updateWindow = null;
  });

  return updateWindow;
}

// Remove these since we're handling them in updater.ts now
// ipcMain.on('show-update-window', async () => {
//   await createUpdateWindow();
// });

// ipcMain.on('close-update-window', () => {
//   if (updateWindow && !updateWindow.isDestroyed()) {
//     updateWindow.close();
//   }
// });

function createErrorOverlayWindow() {
  if (errorOverlayWindow && !errorOverlayWindow.isDestroyed()) {
    return errorOverlayWindow;
  }

  errorOverlayWindow = new BrowserWindow({
    width: electron_screen.getPrimaryDisplay().workAreaSize.width * 0.8,
    height: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  errorOverlayWindow.setAlwaysOnTop(true, 'screen-saver');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: transparent;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          }
          #error-message {
            background-color: rgba(220, 53, 69, 0.9);
            color: white;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 500;
            text-align: center;
            max-width: 90%;
            opacity: 0;
            transition: opacity 0.2s ease-in-out;
            position: relative;
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
            box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          }
          #error-message.visible {
            opacity: 1;
          }
        </style>
      </head>
      <body>
        <div id="error-message"></div>
        <script>
          const { ipcRenderer } = require('electron');
          const errorMessage = document.getElementById('error-message');
          
          ipcRenderer.on('update-error', (event, text) => {
            if (text) {
              errorMessage.textContent = text;
              errorMessage.style.display = 'block';
              errorMessage.classList.add('visible');
              
              // Auto-hide after 5 seconds
              setTimeout(() => {
                errorMessage.classList.remove('visible');
                setTimeout(() => {
                  errorMessage.style.display = 'none';
                  ipcRenderer.send('hide-error-overlay');
                }, 200);
              }, 5000);
            } else {
              errorMessage.classList.remove('visible');
              setTimeout(() => {
                errorMessage.style.display = 'none';
              }, 200);
            }
          });
        </script>
      </body>
    </html>
  `;

  errorOverlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  // Position the window in the center of the screen
  const { width: screenWidth, height: screenHeight } =
    electron_screen.getPrimaryDisplay().workAreaSize;
  const windowBounds = errorOverlayWindow.getBounds();
  errorOverlayWindow.setPosition(
    Math.floor(screenWidth / 2 - windowBounds.width / 2),
    Math.floor(screenHeight / 2 - windowBounds.height / 2)
  );

  errorOverlayWindow.on('closed', () => {
    errorOverlayWindow = null;
  });

  return errorOverlayWindow;
}

// Add IPC handlers for error overlay
ipcMain.on('show-error-overlay', async (event, errorMessage) => {
  const window = await createErrorOverlayWindow();
  if (window && !window.isDestroyed()) {
    window.showInactive();
    window.webContents.send('update-error', errorMessage);
  }
});

ipcMain.on('hide-error-overlay', () => {
  if (errorOverlayWindow && !errorOverlayWindow.isDestroyed()) {
    errorOverlayWindow.hide();
  }
});

// Update session error handler to use new overlay
ipcMain.on('session-error', (event, errorMessage) => {
  ipcMain.emit('show-error-overlay', event, errorMessage);
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
    console.log(`Saved conversation metadata to ${filePath}`);
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
        console.log('Transcription written to file:', textFilePath);
      }
    });
  } catch (error: any) {
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

    console.log('Successfully merged conversation audio');

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

// Forward assistant audio to renderer for recording
ipcMain.on('assistant-audio', (event, audioData) => {
  mainWindow?.webContents.send('assistant-audio', audioData);
});

async function createMarkdownPreviewWindow(filePath: string) {
  if (markdownPreviewWindow) {
    markdownPreviewWindow.focus();
    return;
  }

  markdownPreviewWindow = new BrowserWindow({
    width: Math.floor(electron_screen.getPrimaryDisplay().workAreaSize.width * 0.8),
    height: Math.floor(electron_screen.getPrimaryDisplay().workAreaSize.height * 0.8),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Allow loading local resources
      allowRunningInsecureContent: true, // Allow loading local content
    },
    title: `Preview: ${path.basename(filePath)}`,
  });

  markdownPreviewWindow.maximize();

  if (app.isPackaged) {
    await markdownPreviewWindow.loadURL(
      `file://${__dirname}/../../build/index.html#/markdown-preview`
    );
  } else {
    await markdownPreviewWindow.loadURL('http://localhost:3000/#/markdown-preview');
  }

  // Enable loading of local resources
  markdownPreviewWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' 'unsafe-inline' 'unsafe-eval' data: file:"],
      },
    });
  });

  currentMarkdownFile = filePath;

  markdownPreviewWindow.on('closed', () => {
    markdownPreviewWindow = null;
    currentMarkdownFile = null;
  });
}
function sendMarkdownContent() {
  if (!currentMarkdownFile || !markdownPreviewWindow) return;

  try {
    const content = fs.readFileSync(currentMarkdownFile, 'utf-8');
    const basePath = path.dirname(currentMarkdownFile);
    markdownPreviewWindow.webContents.send('markdown-content-update', { content, basePath });
  } catch (error) {
    console.error('Error reading markdown file:', error);
  }
}

// Add IPC handlers
ipcMain.on('request-markdown-content', () => {
  sendMarkdownContent();
});

ipcMain.on('open-markdown-preview', (_, filePath: string) => {
  createMarkdownPreviewWindow(filePath);
});
