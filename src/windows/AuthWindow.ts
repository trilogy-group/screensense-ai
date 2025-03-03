import { BrowserWindow, ipcMain } from 'electron';
import { loadHtmlFile } from '../utils/window-utils';
import { createMainWindow } from './MainWindow';
import { createSubtitleOverlayWindow } from './SubtitleOverlay';
import { createControlWindow } from './ControlWindow';

let authWindow: BrowserWindow | null = null;

const COGNITO_AUTH_URL =
  'https://us-east-1zflp836cb.auth.us-east-1.amazoncognito.com/login?client_id=4lcdtqstur6sh47v85usf4c2i5&response_type=code&scope=email+openid+phone&redirect_uri=screensense%3A%2F%2Fcallback';

export async function createAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.show();
    authWindow.focus();
    return authWindow;
  }

  console.log('Creating new auth window');
  authWindow = new BrowserWindow({
    width: 400,
    height: 300,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      additionalArguments: [`--auth-url=${encodeURIComponent(COGNITO_AUTH_URL)}`],
    },
    show: false,
    frame: true,
    resizable: false,
    fullscreenable: false,
    center: true,
  });

  authWindow.once('ready-to-show', () => {
    console.log('Auth window ready to show');
    if (authWindow) {
      authWindow.show();
      authWindow.focus();
    }
  });

  // Add error handler
  authWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    console.error('Failed to load auth window:', errorCode, errorDescription);
  });

  authWindow.on('closed', () => {
    console.log('Auth window closed');
    authWindow = null;
  });

  // Load the HTML file using the utility function
  await loadHtmlFile(authWindow, 'auth.html', {
    logPrefix: 'auth window',
  });

  return authWindow;
}

export function closeAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) {
    console.log('Closing auth window');
    authWindow.close();
  }
}

export function getAuthWindow() {
  return authWindow;
}

export function initializeAuthWindow() {
  console.log('Initializing auth window module');

  // Handle auth status check
  ipcMain.handle('check-auth-status', async () => {
    console.log('Checking auth status');
    // For now, we'll always return false since we haven't implemented token storage
    return false;
  });

  // Handle auth success
  ipcMain.handle('handle-auth-success', async (_, code: string) => {
    console.log('Auth success received, creating main windows');

    try {
      // Create main windows
      await createMainWindow();
      await createSubtitleOverlayWindow();
      await createControlWindow();

      // Close auth window after main windows are created
      closeAuthWindow();
      return true;
    } catch (error) {
      console.error('Error creating windows:', error);
      return false;
    }
  });
}
