import { BrowserWindow, app, ipcMain } from 'electron';
import * as path from 'path';
import { logToFile } from '../utils/logger';

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

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  let htmlPath;
  if (isDev) {
    // In development, load from public directory
    htmlPath = path.join(app.getAppPath(), 'public', 'html', 'update.html');
  } else {
    // In production, load from the build directory
    const basePath = app.getAppPath().replace('.asar', '.asar.unpacked');
    htmlPath = path.join(basePath, 'build', 'html', 'update.html');
  }

  logToFile(`Loading update window HTML from: ${htmlPath}`);
  try {
    await updateWindow.loadFile(htmlPath);
    logToFile('Successfully loaded update window HTML');
  } catch (error) {
    logToFile(`Error loading update window HTML: ${error}`);
    throw error;
  }

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
