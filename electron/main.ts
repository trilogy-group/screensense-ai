import { app, BrowserWindow, ipcMain, desktopCapturer, WebContents } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

function logToFile(message: string) {
  const logPath = app.getPath('userData') + '/app.log';
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logPath, `${timestamp}: ${message}\n`);
}

async function createWindow() {
  const isDev = !app.isPackaged;
  logToFile(`Starting app in ${isDev ? 'development' : 'production'} mode`);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,  // Temporarily disable for debugging
      devTools: true
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

    let loadUrl: string;
    if (isDev) {
      loadUrl = 'http://localhost:3000';
    } else {
      // In production, use the app.getAppPath() to get the correct base path
      const appPath = app.getAppPath();
      // Remove .asar from the path to access unpacked resources
      const basePath = appPath.replace('.asar', '.asar.unpacked');
      const indexPath = path.join(basePath, 'build', 'index.html');
      
      // Log more details about the paths
      logToFile(`Base path: ${basePath}`);
      logToFile(`Index path: ${indexPath}`);
      logToFile(`Directory contents of build:`);
      try {
        const buildContents = fs.readdirSync(path.join(basePath, 'build'));
        logToFile(JSON.stringify(buildContents, null, 2));
      } catch (error) {
        logToFile(`Error reading build directory: ${error}`);
      }
      
      loadUrl = `file://${indexPath}`;
    }
    
    logToFile(`App path: ${app.getAppPath()}`);
    logToFile(`Attempting to load URL: ${loadUrl}`);
    logToFile(`Build path exists: ${fs.existsSync(loadUrl.replace('file://', ''))}`);

    try {
      await mainWindow.loadURL(loadUrl);
      logToFile('Successfully loaded the window URL');
    } catch (error) {
      logToFile(`Error loading URL: ${error}`);
    }

    // Log when the page finishes loading
    mainWindow.webContents.on('did-finish-load', () => {
      logToFile('Page finished loading');
    });

    // Log any errors that occur during page load
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      logToFile(`Failed to load: ${errorDescription} (${errorCode})`);
    });

    // Add console logging from the renderer process
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      logToFile(`Console [${level}]: ${message} (${sourceId}:${line})`);
    });

    // Always open DevTools in production for now to help debug
    mainWindow.webContents.openDevTools();
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