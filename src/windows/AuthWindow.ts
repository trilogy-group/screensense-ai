import { BrowserWindow, ipcMain, session, shell } from 'electron';
import {
  COGNITO_AUTH_URL,
  COGNITO_CLIENT_ID,
  COGNITO_REDIRECT_URI,
  COGNITO_TOKEN_URL,
  COGNITO_LOGOUT_URL,
} from '../constants/constants';
import {
  clearTokens,
  getTokens,
  isTokenExpired,
  refreshTokens,
  saveTokens,
} from '../services/tokenService';
import { logToFile } from '../utils/logger';
import { generateCodeChallenge, generateCodeVerifier } from '../utils/pkce';
import { loadHtmlFile } from '../utils/window-utils';
import { closeActionWindow } from './ActionWindow';
import { closeControlWindow, createControlWindow } from './ControlWindow';
import { hideErrorOverlay } from './ErrorOverlay';
import { closeMainWindow, createMainWindow, sendAssistantsRefreshed } from './MainWindow';
import { closeMarkdownPreviewWindow } from './MarkdownPreviewWindow';
import { closeSettingsWindow } from './SettingsWindow';
import { closeSubtitleOverlayWindow, createSubtitleOverlayWindow } from './SubtitleOverlay';
import { closeUpdateWindow } from './UpdateWindow';
// import { fetchUserData } from '../services/apiMain';
import { storeAssistants, clearStoredAssistants } from '../services/assistantStore';

// Use require for apiMain to avoid TypeScript build issues
import { fetchUserData } from '../services/api';

let authWindow: BrowserWindow | null = null;
let currentCodeVerifier: string | null = null;

export async function createAuthWindow() {
  if (authWindowExists()) {
    authWindow?.show();
    authWindow?.focus();
    return authWindow;
  }

  // Generate PKCE values
  currentCodeVerifier = await generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(currentCodeVerifier);

  console.log('Creating new auth window');
  authWindow = new BrowserWindow({
    width: 400,
    height: 300,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      additionalArguments: [
        `--auth-url=${encodeURIComponent(COGNITO_AUTH_URL)}`,
        `--code-challenge=${encodeURIComponent(codeChallenge)}`,
      ],
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
    logToFile(`Failed to load auth window: ${errorCode} - ${errorDescription}`);
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

export function authWindowExists() {
  return authWindow && !authWindow.isDestroyed();
}

export function closeAuthWindow() {
  if (authWindowExists()) {
    console.log('Closing auth window');
    authWindow?.close();
  }
}

export function getAuthWindow() {
  return authWindow;
}

export function sendAuthCallback(url: string) {
  if (authWindowExists()) {
    authWindow?.webContents.send('auth-callback', url);
  }
}

async function launchScreenSense() {
  // Create main windows
  await createMainWindow();
  await createSubtitleOverlayWindow();
  await createControlWindow();
  closeAuthWindow();
}

export async function performCognitoLogout(): Promise<boolean> {
  console.log('Performing complete Cognito logout');
  try {
    // Step 1: Clear all local cookies and session data to ensure local logout
    await session.defaultSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'websql', 'cachestorage'],
    });
    console.log('Cleared local session storage and cookies');

    // Step 2: Open the Cognito logout endpoint in the default browser
    // According to AWS docs: https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html
    // This will:
    // 1. Sign the user out of their Cognito user session
    // 2. Clear Cognito cookies and tokens
    // 3. Redirect to the specified logout_uri (must be registered in Cognito)
    console.log('Opening Cognito logout URL in default browser:', COGNITO_LOGOUT_URL);
    await shell.openExternal(COGNITO_LOGOUT_URL);

    return true;
  } catch (error) {
    console.error('Error during Cognito logout:', error);
    logToFile(`Error during Cognito logout: ${error}`);
    return false;
  }
}

// Function to refresh assistants list
export async function refreshAssistantsList() {
  console.log('Refreshing assistants list...');
  try {
    const userData = await fetchUserData();
    storeAssistants(userData.assistants);
    console.log('Assistants list refreshed successfully');

    // Notify all renderer processes about the assistants refresh
    sendAssistantsRefreshed();

    return true;
  } catch (error) {
    console.error('Error refreshing assistants list:', error);
    logToFile(`Error refreshing assistants list: ${error}`);
    return false;
  }
}

export function initializeAuthWindow() {
  console.log('Initializing auth window module');

  // Set up hourly assistant list refresh
  setInterval(
    () => {
      console.log('Scheduled assistants list refresh');
      refreshAssistantsList().catch(err => {
        console.error('Error in scheduled assistants refresh:', err);
        logToFile(`Error in scheduled assistants refresh: ${err}`);
      });
    },
    60 * 60 * 1000 // Refresh every hour (60 minutes * 60 seconds * 1000 milliseconds)
  );

  // Handle sign out
  ipcMain.handle('sign-out', async () => {
    console.log('Sign out requested');
    try {
      // Close all windows
      closeMainWindow();
      closeSubtitleOverlayWindow();
      closeControlWindow();
      closeAuthWindow();
      closeActionWindow();
      hideErrorOverlay();
      closeMarkdownPreviewWindow();
      closeSettingsWindow();
      closeUpdateWindow();

      console.log('All windows closed');

      // First perform Cognito web logout
      const cognitoLogoutSuccess = await performCognitoLogout();
      console.log('Cognito logout result:', cognitoLogoutSuccess);

      // Then clear local tokens
      clearTokens();
      console.log('Tokens cleared');

      // For some reason, we need a slight delay here, otherwise the auth window creation fails
      // TODO: Figure out why this is happening
      await new Promise(resolve => setTimeout(resolve, 100));
      await createAuthWindow();
      console.log('Auth window created');

      return true;
    } catch (error) {
      console.error('Error during sign out:', error);
      logToFile(`Error during sign out: ${error}`);
      return false;
    }
  });

  // Handle auth status check
  ipcMain.handle('check-auth-status', async () => {
    console.log('Checking auth status');
    const tokens = getTokens();
    if (!tokens) return false;

    // If token is expired, try to refresh it
    if (isTokenExpired()) {
      console.log('Token expired, attempting refresh');
      const refreshed = await refreshTokens();
      if (!refreshed) {
        console.log('Token refresh failed');
        return false;
      }
      console.log('Token refreshed successfully');
    }

    return true;
  });

  // Handle auth success
  ipcMain.handle('handle-auth-success', async (_, code: string) => {
    console.log('Auth success received, processing token');

    // Common function to fetch user data and launch app
    const fetchDataAndLaunch = async () => {
      try {
        // Fetch user data to verify token works and get assistant configurations
        console.log('Fetching user data...');
        const userData = await fetchUserData();
        // console.log('User data fetched successfully:', JSON.stringify(userData, null, 2));

        // Store the assistants in memory
        storeAssistants(userData.assistants);

        // Create main windows
        await launchScreenSense();
        return true;
      } catch (error) {
        console.error('Error fetching user data or creating windows:', error);
        logToFile(`Error fetching user data or creating windows: ${error}`);

        // Clear tokens to force re-sign in
        clearTokens();
        return false;
      }
    };

    // If code is 'already-authenticated', we have valid tokens
    if (code === 'already-authenticated') {
      return fetchDataAndLaunch();
    }

    // Otherwise, proceed with code exchange
    if (!currentCodeVerifier) {
      throw new Error('No code verifier found. Please restart the authentication process.');
    }

    try {
      // Exchange the code for tokens
      const requestBody = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: COGNITO_CLIENT_ID,
        code: code,
        redirect_uri: COGNITO_REDIRECT_URI,
        code_verifier: currentCodeVerifier,
      });

      const tokenResponse = await fetch(COGNITO_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: requestBody,
      });

      const responseText = await tokenResponse.text();

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

      // Fetch user data and launch app
      return fetchDataAndLaunch();
    } catch (error) {
      console.error('Error handling auth success:', error);
      logToFile(`Error handling auth success: ${error}`);

      // Clear tokens to force re-sign in
      clearTokens();
      return false;
    } finally {
      // Clear the code verifier after use
      currentCodeVerifier = null;
    }
  });
}
