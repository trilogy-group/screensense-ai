import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { closeMainWindow, hideMainWindow, mainWindowExists, requestModeUpdate } from './MainWindow';
import { logToFile } from '../utils/logger';
import { loadHtmlFile } from '../utils/window-utils';
import { closeSubtitleOverlayWindow } from './SubtitleOverlay';

let controlWindow: BrowserWindow | null = null;

export function getControlWindow() {
  return controlWindow;
}

export function controlWindowExists() {
  return controlWindow && !controlWindow.isDestroyed();
}

export function sendControlUpdate(state: any) {
  if (controlWindowExists()) {
    controlWindow?.webContents.send('update-controls', state);
  }
}

export function sendScreenShareResult(success: boolean) {
  if (controlWindowExists()) {
    controlWindow?.webContents.send('screen-share-result', success);
  }
}

export function sendSettingsUpdate(apiKey: string) {
  if (controlWindowExists()) {
    controlWindow?.webContents.send('settings-updated', !!apiKey);
  }
}

export function sendApiKeyCheck(hasApiKey: boolean) {
  if (controlWindowExists()) {
    controlWindow?.webContents.send('api-key-check', hasApiKey);
  }
}

export function sendCarouselUpdate(data: { modeName: string; requiresDisplay: boolean }) {
  if (controlWindowExists()) {
    controlWindow?.webContents.send('update-carousel', data);
  }
}

export function sendRevertConnectionState() {
  if (controlWindowExists()) {
    controlWindow?.webContents.send('revert-connection-state');
  }
}

export async function createControlWindow() {
  if (controlWindowExists()) {
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
    closeMainWindow();
    // TODO: Use functions instead of ipcMain.emit
    ipcMain.emit('close-settings-window');
    closeSubtitleOverlayWindow();
    controlWindow = null;
    app.quit();
  });

  // Ensure it stays on top even when other windows request always on top
  controlWindow.setAlwaysOnTop(true, 'screen-saver');

  // Wait for window to be ready before showing
  controlWindow.once('ready-to-show', () => {
    // Send initial mode update
    requestModeUpdate();
  });

  await loadHtmlFile(controlWindow, 'control-window.html', {
    logPrefix: 'control window',
  });

  return controlWindow;
}

export function closeControlWindow() {
  if (controlWindowExists()) {
    controlWindow?.close();
  }
}

// Initialize module
export function initializeControlWindow() {
  // Register IPC Handlers
  ipcMain.on('close-control-window', () => {
    closeControlWindow();
  });

  ipcMain.on('screen-share-result', (event, success) => {
    try {
      if (controlWindow && !controlWindow.isDestroyed()) {
        controlWindow.webContents.send('screen-share-result', success);
        // If screen sharing failed, hide the main window
        if (!success && mainWindowExists()) {
          hideMainWindow();
        }
      }
    } catch (error) {
      logToFile(`Error handling screen share result: ${error}`);
    }
  });

  ipcMain.on('revert-control-button', () => {
    if (controlWindowExists()) {
      controlWindow?.webContents.send('revert-connection-state');
    }
  });
}
