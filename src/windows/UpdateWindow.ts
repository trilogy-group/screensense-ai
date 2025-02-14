import { BrowserWindow, app, ipcMain } from 'electron';
import * as path from 'path';

let updateWindow: BrowserWindow | null = null;

export async function createUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.show();
    return updateWindow;
  }

  updateWindow = new BrowserWindow({
    width: 400,
    height: 200,
    frame: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const isDev = !app.isPackaged;
  let loadUrl: string;
  if (isDev) {
    loadUrl = 'http://localhost:3000/update.html';
  } else {
    const basePath = app.getAppPath().replace('.asar', '.asar.unpacked');
    const indexPath = path.join(basePath, 'build', 'update.html');
    loadUrl = `file://${indexPath}`;
  }

  await updateWindow.loadURL(loadUrl);
  updateWindow.on('closed', () => {
    updateWindow = null;
  });

  return updateWindow;
}

export function getUpdateWindow() {
  return updateWindow;
}

export function closeUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
  }
}

// Initialize module
export function initializeUpdateWindow() {
  // Register IPC Handlers
  ipcMain.on('show-update-window', async () => {
    await createUpdateWindow();
  });

  ipcMain.on('close-update-window', () => {
    closeUpdateWindow();
  });
}
