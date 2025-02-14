import { BrowserWindow, ipcMain, screen, app } from 'electron';
import { logToFile } from '../utils/logger';
import { loadHtmlFile } from '../utils/window-utils';

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

  await loadHtmlFile(errorOverlayWindow, 'error-overlay.html', {
    logPrefix: 'error overlay window',
  });

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
