import { BrowserWindow, app, ipcMain, shell } from 'electron';

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
    width: 300,
    height: 200,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
    frame: true,
    resizable: false,
    fullscreenable: false,
    center: true,
  });

  // Create a simple HTML content
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: #f5f5f5;
          }
          .button {
            background: #4285f4;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
          }
          .button:hover {
            background: #357abd;
          }
          .message {
            text-align: center;
            margin-bottom: 20px;
            color: #333;
          }
        </style>
      </head>
      <body>
        <div class="message">Click below to sign in to ScreenSense</div>
        <button class="button" onclick="openAuthPage()">Sign in</button>
        <script>
          const { shell } = require('electron');
          
          function openAuthPage() {
            shell.openExternal('${COGNITO_AUTH_URL}');
          }

          // Handle auth callback
          const { ipcRenderer } = require('electron');
          
          ipcRenderer.on('auth-callback', async (event, url) => {
            console.log('Received auth callback');
            const urlObj = new URL(url);
            const code = urlObj.searchParams.get('code');
            
            if (code) {
              console.log('Auth code received, emitting auth-success');
              // In a real implementation, we would exchange the code for tokens here
              // For now, just emit success since we'll implement token exchange later
              ipcRenderer.send('auth-success', { id: code });
            }
          });

          // Handle auth status check
          ipcRenderer.on('get-auth-status', () => {
            console.log('Received auth status check');
            // For now, we'll always return false since we haven't implemented token storage
            ipcRenderer.send('auth-status-response', false);
          });
        </script>
      </body>
    </html>
  `;

  // Load the HTML content
  authWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

  authWindow.once('ready-to-show', () => {
    if (authWindow) {
      authWindow.show();
      authWindow.focus();
    }
  });

  authWindow.on('closed', () => {
    console.log('Auth window closed');
    authWindow = null;
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

  // Listen for auth success but don't close window immediately
  ipcMain.on('auth-success', () => {
    console.log('Auth success received');
  });

  // Listen for explicit close command after main windows are created
  ipcMain.on('close-auth-window', () => {
    console.log('Closing auth window after main windows created');
    closeAuthWindow();
  });
}
