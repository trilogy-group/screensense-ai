import { BrowserWindow, ipcMain } from 'electron';
import { loadHtmlFile } from '../utils/window-utils';

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

  await loadHtmlFile(updateWindow, 'update.html', {
    logPrefix: 'update window',
  });

  updateWindow.on('closed', () => {
    updateWindow = null;
  });

  return updateWindow;
}

export function getUpdateWindow() {
  return updateWindow;
}

function updateWindowExists() {
  return updateWindow && !updateWindow.isDestroyed();
}

export function closeUpdateWindow() {
  if (updateWindowExists()) {
    updateWindow?.close();
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
