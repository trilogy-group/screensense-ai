import { BrowserWindow, app, nativeImage, WebContents, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { initializeAutoUpdater } from '../../electron/updater';
import { closeControlWindow } from './ControlWindow';
import { logToFile } from '../utils/logger';
import { loadHtmlFile, loadUrl } from '../utils/window-utils';
import { closeSubtitleOverlayWindow } from './SubtitleOverlay';

let mainWindow: BrowserWindow | null = null;

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

export async function createMainWindow() {
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

    try {
      if (isDev) {
        await loadUrl(mainWindow, 'http://localhost:3000', { logPrefix: 'main window' });
      } else {
        await loadHtmlFile(mainWindow, 'index.html', {
          logPrefix: 'main window',
          useHtmlDir: false,
        });
      }
    } catch (error) {
      logToFile(`Error loading main window content: ${error}`);
      throw error;
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

export function getMainWindow() {
  return mainWindow;
}

export function showMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}

export function hideMainWindow() {
  if (mainWindow) {
    mainWindow.hide();
  }
}

export function closeMainWindow() {
  if (mainWindow) {
    mainWindow.removeAllListeners('close');
    mainWindow.close();
  }
}

export function requestModeUpdate() {
  if (mainWindowExists()) {
    // Force a mode update from the main window
    mainWindow?.webContents.send('request-mode-update');
  }
}

export function mainWindowExists() {
  return mainWindow && !mainWindow.isDestroyed();
}

export function updateSettings(settings: any) {
  if (mainWindowExists()) {
    mainWindow?.webContents.send('update-settings', settings);
  }
}

export function initSavedSettings(savedSettings: any) {
  if (mainWindowExists()) {
    mainWindow?.webContents.send('init-saved-settings', savedSettings);
  }
}

export function sendControlAction(action: any) {
  if (mainWindowExists()) {
    mainWindow?.webContents.send('control-action', action);
  }
}

export function sendCarouselAction(direction: string) {
  if (mainWindowExists()) {
    mainWindow?.webContents.send('carousel-action', direction);
  }
}

export function sendAssistantAudio(audioData: any) {
  if (mainWindowExists()) {
    mainWindow?.webContents.send('assistant-audio', audioData);
  }
}

export function sendGeminiMessage({ message }: { message: string }) {
  if (mainWindowExists()) {
    mainWindow?.webContents.send('send-gemini-message', { message });
  }
}

// export function reinitializePatentAgent() {
//   if (mainWindowExists()) {
//     mainWindow?.webContents.send('reinitialize-patent-agent');
//   }
// }

// Initialize module
export function initializeMainWindow() {
  // Register IPC Handlers
  ipcMain.on('close-main-window', () => {
    closeMainWindow();
    closeControlWindow();
    closeSubtitleOverlayWindow();
  });

  ipcMain.on('show-main-window', () => {
    showMainWindow();
  });

  ipcMain.on('hide-main-window', () => {
    hideMainWindow();
  });

  ipcMain.on('assistant-audio', (event, audioData) => {
    sendAssistantAudio(audioData);
  });

  ipcMain.on('carousel-action', async (event, direction) => {
    try {
      if (!mainWindowExists()) {
        await createMainWindow();
      }
      if (mainWindowExists()) {
        sendCarouselAction(direction);
      }
    } catch (error) {
      logToFile(`Error handling carousel action: ${error}`);
    }
  });

  ipcMain.on('control-action', async (event, action) => {
    try {
      // Create main window if it doesn't exist for any control action
      if (!mainWindowExists()) {
        await createMainWindow();
      }

      if (mainWindowExists()) {
        // Show window if screen sharing is being activated
        if (action.type === 'screen' && action.value === true) {
          showMainWindow();
        }
        // Hide window if screen sharing is being deactivated
        else if (action.type === 'screen' && action.value === false) {
          hideMainWindow();
        }
        // Show window if webcam is being activated
        else if (action.type === 'webcam' && action.value === true) {
          showMainWindow();
        }
        sendControlAction(action);
      }
    } catch (error) {
      logToFile(`Error handling control action: ${error}`);
      event.reply('control-action-error', {
        error: 'Failed to process control action',
      });
    }
  });

  initSavedSettings(loadSettings());
}
