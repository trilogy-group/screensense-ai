import { app, BrowserWindow, ipcMain, desktopCapturer, WebContents } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

async function createWindow() {
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true,
    },
  });

  // Set permissions for media access
  if (mainWindow) {
    mainWindow.webContents.session.setPermissionRequestHandler((
      webContents: WebContents,
      permission: string,
      callback: (granted: boolean) => void
    ) => {
      const allowedPermissions = ['media', 'display-capture', 'screen', 'mediaKeySystem'];
      if (allowedPermissions.includes(permission)) {
        callback(true);
      } else {
        callback(false);
      }
    });

    // Enable screen capture
    mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
      mainWindow?.webContents.send('show-screen-picker');
      callback({}); // Let the renderer handle source selection
    });

    await mainWindow.loadURL(
      isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../build/index.html')}`
    );

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  }

  createOverlayWindow();
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 800,
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

  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: transparent;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          }
          #subtitles {
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 24px;
            font-weight: 500;
            text-align: center;
            max-width: 80%;
            display: none;
          }
        </style>
      </head>
      <body>
        <div id="subtitles"></div>
        <script>
          const { ipcRenderer } = require('electron');
          const subtitles = document.getElementById('subtitles');
          
          ipcRenderer.on('update-subtitles', (event, text) => {
            if (text) {
              subtitles.textContent = text;
              subtitles.style.display = 'block';
            } else {
              subtitles.style.display = 'none';
            }
          });
        </script>
      </body>
    </html>
  `;

  overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
}

// Handle IPC for screen sharing
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 150, height: 150 }
  });
  return sources;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on('update-subtitles', (event, text) => {
  if (overlayWindow) {
    overlayWindow.webContents.send('update-subtitles', text);
    if (text) {
      overlayWindow.showInactive();
    } else {
      overlayWindow.hide();
    }
  }
});

ipcMain.on('remove-subtitles', () => {
  if (overlayWindow) {
    overlayWindow.hide();
  }
}); 