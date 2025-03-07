import { Key, keyboard } from '@nut-tree-fork/nut-js';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { app, BrowserWindow, clipboard, desktopCapturer, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { initializeContext } from '../src/utils/context-utils';
import { initializeKBHandlers } from '../src/utils/kb-utils';
import { logToFile } from '../src/utils/logger';
import { loadSession } from '../src/utils/patent-utils';
import { initializeActionWindow } from '../src/windows/ActionWindow';
import {
  createAuthWindow,
  initializeAuthWindow,
  sendAuthCallback,
} from '../src/windows/AuthWindow';
import { initializeControlWindow } from '../src/windows/ControlWindow';
import { initializeErrorOverlay } from '../src/windows/ErrorOverlay';
import { initializeMainWindow } from '../src/windows/MainWindow';
import { initializeMarkdownPreviewWindow } from '../src/windows/MarkdownPreviewWindow';
import { initializeSettingsWindow } from '../src/windows/SettingsWindow';
import { initializeSubtitleOverlay } from '../src/windows/SubtitleOverlay';
import { initializeUpdateWindow } from '../src/windows/UpdateWindow';
import { COGNITO_REDIRECT_URI, COGNITO_LOGOUT_REDIRECT_URI } from '../src/constants/constants';
import { resolve } from 'path';
import { clearUpdateCheckInterval } from './updater';
import { clearAssistantsRefreshInterval } from '../src/windows/AuthWindow';

dotenv.config();

// Set environment variables for the packaged app
if (!app.isPackaged) {
  require('dotenv-flow').config();
} else {
  require('dotenv').config({ path: path.join(process.resourcesPath, '.env') });
}

// Add this near the top with other state variables
let currentAssistantMode = 'daily_helper'; // Default mode
let isSessionActive = false;
let deeplinkingUrl: string | undefined;

const isDev = !app.isPackaged;

// Move this before any app.on handlers
if (isDev && process.platform === 'win32') {
  // Set the path of electron.exe and your app.
  // These two additional parameters are only available on windows.
  app.setAsDefaultProtocolClient('screensense', process.execPath, [resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient('screensense');
}

// Force single application instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    if (process.platform !== 'darwin') {
      // Check for auth callback first
      const authCallback = argv.find(arg => arg.startsWith(COGNITO_REDIRECT_URI));
      if (authCallback) {
        console.log('Processing auth callback URL from second instance');
        sendAuthCallback(authCallback);
        return;
      }

      // Check for logout callback
      const logoutUrl = argv.find(arg => arg.startsWith(COGNITO_LOGOUT_REDIRECT_URI));
      if (logoutUrl) {
        console.log('Received logout redirect from second instance');
        return;
      }

      // Handle other deep links
      deeplinkingUrl = argv.find(arg => arg.startsWith('screensense://'));
    }

    // Focus existing window
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      if (deeplinkingUrl) {
        mainWindow.webContents.send('deep-link', deeplinkingUrl);
      }
    }
  });
}

// Add auth URL handling to the open-url handler
app.on('open-url', function (event, url) {
  event.preventDefault();
  deeplinkingUrl = url;

  // Handle auth callbacks
  if (url.startsWith(COGNITO_REDIRECT_URI)) {
    console.log('Processing auth callback URL');
    sendAuthCallback(url);
    return;
  }
  // Handle logout redirect
  if (url.startsWith(COGNITO_LOGOUT_REDIRECT_URI)) {
    console.log('Received logout redirect');
    return;
  }

  // Handle other deep links
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    mainWindow.webContents.send('deep-link', url);
  }
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
  initializeAuthWindow();
  initializeContext();
  initializeKBHandlers();

  // Create auth window first and wait for authentication
  await createAuthWindow();

  // Check if we have a deep link URL on startup
  if (process.platform !== 'darwin') {
    const deepLink = process.argv.find(arg => arg.startsWith('screensense://'));
    if (deepLink) {
      deeplinkingUrl = deepLink;
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('deep-link', deepLink);
      }
    }
  }
}

// Call it after registering all handlers
app.whenReady().then(initializeApp);

// Handle window close
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up resources before app quits
app.on('will-quit', () => {
  console.log('App is quitting, cleaning up resources...');

  // Clean up assistants refresh interval
  try {
    clearAssistantsRefreshInterval();
  } catch (error) {
    console.error('Error clearing assistants refresh interval:', error);
  }

  // Clean up update check interval
  try {
    clearUpdateCheckInterval();
  } catch (error) {
    console.error('Error clearing update check interval:', error);
  }
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

// Handler to check if app is in development mode
ipcMain.handle('is-dev', () => {
  return isDev;
});

// Handler to get stored assistant configurations
ipcMain.handle('get-user-assistants', () => {
  try {
    // Import dynamically to avoid circular dependencies
    const { getStoredAssistants } = require('../src/services/assistantStore');
    const assistants = getStoredAssistants();

    if (!assistants) {
      console.log('No assistants found in store');
      return [];
    }

    return assistants;
  } catch (error) {
    console.error('Error retrieving assistants:', error);
    return [];
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

// Reset only the session name when app starts or restarts
app.on('ready', () => {
  loadSession();
});

// Add this with other IPC handlers
ipcMain.handle('get-current-mode-and-is-session-active', () => {
  return { currentAssistantMode, isSessionActive };
});

// Add this with other IPC listeners
ipcMain.on('update-current-mode', (_, mode) => {
  currentAssistantMode = mode;
});

ipcMain.on('update-is-session-active', (_, active) => {
  isSessionActive = active;
});
