import { BrowserWindow, ipcMain } from 'electron';
import { loadHtmlFile } from '../utils/window-utils';
import { createMainWindow } from './MainWindow';
import { createSubtitleOverlayWindow } from './SubtitleOverlay';
import { createControlWindow } from './ControlWindow';
import {
  COGNITO_AUTH_URL,
  COGNITO_TOKEN_URL,
  COGNITO_CLIENT_ID,
  COGNITO_CLIENT_SECRET,
  COGNITO_REDIRECT_URI,
} from '../constants/constants';
import { saveTokens, getTokens, isTokenExpired } from '../services/tokenService';
import { logToFile } from '../utils/logger';

let authWindow: BrowserWindow | null = null;

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

export function sendAuthCallback(url: string) {
  if (authWindow) {
    authWindow.webContents.send('auth-callback', url);
  }
}

export function initializeAuthWindow() {
  console.log('Initializing auth window module');

  // Handle auth status check
  ipcMain.handle('check-auth-status', async () => {
    console.log('Checking auth status');
    const tokens = getTokens();
    if (!tokens) return false;
    return !isTokenExpired();
  });

  // Handle auth success
  ipcMain.handle('handle-auth-success', async (_, code: string) => {
    console.log('Auth success received, processing token');

    try {
      // Exchange the code for tokens
      const tokenResponse = await fetch(COGNITO_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: COGNITO_CLIENT_ID,
          client_secret: COGNITO_CLIENT_SECRET,
          code: code,
          redirect_uri: COGNITO_REDIRECT_URI,
        }),
      });

      const responseText = await tokenResponse.text();
      // console.log(`Token response status: ${tokenResponse.status}`);
      // console.log(`Token response body: ${responseText}`);

      if (!tokenResponse.ok) {
        throw new Error(`Failed to exchange code for tokens: ${responseText}`);
      }

      const tokenData = JSON.parse(responseText);

      // Save the tokens
      saveTokens({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + tokenData.expires_in * 1000,
        id_token: tokenData.id_token,
      });

      // Create main windows
      await createMainWindow();
      await createSubtitleOverlayWindow();
      await createControlWindow();

      // Close auth window after main windows are created
      closeAuthWindow();
      return true;
    } catch (error) {
      console.error('Error handling auth success:', error);
      logToFile(`Error handling auth success: ${error}`);
      return false;
    }
  });
}
