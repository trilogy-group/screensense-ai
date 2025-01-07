import { WebContents } from 'electron';
const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('path');

// Check if running in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

async function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true
    },
  });

  // Set permissions for media access
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
    mainWindow.webContents.send('show-screen-picker');
    callback({}); // Let the renderer handle source selection
  });

  // Handle IPC for screen sharing
  ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 150, height: 150 }
    });
    return sources;
  });

  // Load the index.html from a url in development
  // or the local file in production.
  await mainWindow.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../build/index.html')}`
  );

  // Open the DevTools in development.
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(createWindow);

// Quit when all windows are closed.
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