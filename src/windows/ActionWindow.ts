import { BrowserWindow, screen as electron_screen, ipcMain } from 'electron';
import { logToFile } from '../utils/logger';

let actionWindow: BrowserWindow | null = null;

async function createActionWindow() {
  if (actionWindow && !actionWindow.isDestroyed()) {
    return actionWindow;
  }

  actionWindow = new BrowserWindow({
    width: 120,
    height: 150,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    type: 'toolbar',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });

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

export function actionWindowExists() {
  return actionWindow && !actionWindow.isDestroyed();
}

export function closeActionWindow() {
  if (actionWindowExists()) {
    actionWindow?.close();
  }
}

export async function showActionWindow() {
  const window = await createActionWindow();
  if (window && !window.isDestroyed()) {
    const primaryDisplay = electron_screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const windowBounds = window.getBounds();
    const x = screenWidth - windowBounds.width - 20;
    const y = screenHeight - windowBounds.height - 20;

    window.setPosition(x, y);
    window.showInactive();
  }
}

export function updateActionWindow(data: { imagePath: string; text: string }) {
  if (actionWindowExists()) {
    const fileUrl = `file://${data.imagePath.replace(/\\/g, '/')}`;
    actionWindow?.webContents.send('update-action', {
      imagePath: fileUrl,
      text: data.text,
    });
  }
}

export function hideActionWindow() {
  if (actionWindowExists()) {
    actionWindow?.hide();
  }
}

export function initializeActionWindow() {
  ipcMain.on('show-action', async () => {
    await showActionWindow();
  });

  ipcMain.on('update-action', (event, data) => {
    updateActionWindow(data);
  });

  ipcMain.on('update-action', async (event, data) => {
    updateActionWindow(data);
  });

  ipcMain.on('hide-action', () => {
    hideActionWindow();
  });
}
