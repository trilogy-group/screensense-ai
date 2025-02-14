import { app, BrowserWindow, ipcMain } from 'electron';
import { logToFile } from '../utils/logger';
import { loadHtmlFile } from '../utils/window-utils';

let subtitleOverlayWindow: BrowserWindow | null = null;

export function getSubtitleOverlayWindow() {
  return subtitleOverlayWindow;
}

export function subtitleOverlayWindowExists() {
  return subtitleOverlayWindow && !subtitleOverlayWindow.isDestroyed();
}

export async function createSubtitleOverlayWindow() {
  if (subtitleOverlayWindowExists()) {
    return subtitleOverlayWindow;
  }

  subtitleOverlayWindow = new BrowserWindow({
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

  subtitleOverlayWindow.setIgnoreMouseEvents(true);
  subtitleOverlayWindow.setAlwaysOnTop(true, 'screen-saver');

  await loadHtmlFile(subtitleOverlayWindow, 'overlay-window.html', {
    logPrefix: 'subtitle overlay window',
  });

  // Handle window close
  subtitleOverlayWindow.on('closed', () => {
    subtitleOverlayWindow = null;
  });

  return subtitleOverlayWindow;
}

export function closeSubtitleOverlayWindow() {
  if (subtitleOverlayWindowExists()) {
    subtitleOverlayWindow?.close();
  }
}

export function showSubtitles(text: string) {
  if (subtitleOverlayWindowExists()) {
    subtitleOverlayWindow?.webContents.send('update-subtitles', text);
    if (text) {
      subtitleOverlayWindow?.showInactive();
    } else {
      subtitleOverlayWindow?.hide();
    }
  }
}

export function hideSubtitles() {
  if (subtitleOverlayWindowExists()) {
    subtitleOverlayWindow?.hide();
  }
}

// Initialize module
export function initializeSubtitleOverlay() {
  // Register IPC Handlers
  ipcMain.on('update-subtitles', (event, text) => {
    showSubtitles(text);
  });

  ipcMain.on('remove-subtitles', () => {
    hideSubtitles();
  });
}
