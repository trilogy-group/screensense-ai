import { BrowserWindow, ipcMain, screen, app } from 'electron';
import * as path from 'path';
import { logToFile } from '../utils/logger';

let errorOverlayWindow: BrowserWindow | null = null;

async function createErrorOverlayWindow() {
  if (errorOverlayWindow && !errorOverlayWindow.isDestroyed()) {
    return errorOverlayWindow;
  }

  errorOverlayWindow = new BrowserWindow({
    width: screen.getPrimaryDisplay().workAreaSize.width * 0.8,
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

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  let htmlPath;
  if (isDev) {
    // In development, load from public directory
    htmlPath = path.join(app.getAppPath(), 'public', 'html', 'error-overlay.html');
  } else {
    // In production, load from the build directory
    const basePath = app.getAppPath().replace('.asar', '.asar.unpacked');
    htmlPath = path.join(basePath, 'build', 'html', 'error-overlay.html');
  }

  logToFile(`Loading error overlay HTML from: ${htmlPath}`);
  try {
    await errorOverlayWindow.loadFile(htmlPath);
    logToFile('Successfully loaded error overlay HTML');
  } catch (error) {
    logToFile(`Error loading error overlay HTML: ${error}`);
    throw error;
  }

  // Position the window in the center of the screen
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
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

export async function showErrorOverlay(errorMessage: string) {
  const window = await createErrorOverlayWindow();
  if (window && !window.isDestroyed()) {
    window.showInactive();
    window.webContents.send('update-error', errorMessage);
  }
}

export function hideErrorOverlay() {
  if (errorOverlayWindow && !errorOverlayWindow.isDestroyed()) {
    errorOverlayWindow.hide();
  }
}

// Initialize module
export function initializeErrorOverlay() {
  ipcMain.on('hide-error-overlay', () => {
    hideErrorOverlay();
  });

  ipcMain.on('session-error', (event, errorMessage) => {
    showErrorOverlay(errorMessage);
  });
}
