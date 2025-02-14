import { BrowserWindow, ipcMain } from 'electron';
import { loadSettings, saveSettings } from '../utils/settings-utils';
import { loadHtmlFile } from '../utils/window-utils';
import { sendSettingsUpdate } from './ControlWindow';
import { updateSettings } from './MainWindow';

let settingsWindow: BrowserWindow | null = null;

export async function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: true,
    show: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Prevent window from being closed directly
  settingsWindow.on('close', event => {
    event.preventDefault();
    settingsWindow?.hide();
  });

  await loadHtmlFile(settingsWindow, 'settings-window.html', {
    logPrefix: 'settings window',
  });

  settingsWindow.once('ready-to-show', () => {
    if (settingsWindow) {
      settingsWindow.show();
      // Initialize settings with saved data
      const savedSettings = loadSettings();
      settingsWindow.webContents.send('init-settings', savedSettings);
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

export function closeSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
}

export function settingsWindowExists() {
  return settingsWindow && !settingsWindow.isDestroyed();
}

export function initializeSettingsWindow() {
  // Register IPC Handlers
  ipcMain.on('show-settings', async () => {
    await createSettingsWindow();
  });

  ipcMain.handle('check-api-key', async () => {
    const settings = loadSettings();
    const hasApiKey = !!settings.geminiApiKey;

    if (!hasApiKey) {
      await createSettingsWindow();
    }

    return hasApiKey;
  });

  ipcMain.on('settings-data', (event, settings) => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('init-settings', settings);
    }
  });

  ipcMain.on('save-settings', (event, settings) => {
    // Save settings to file
    saveSettings(settings);

    // Send settings to main window
    updateSettings(settings);

    // Just notify control window about API key availability without starting session
    sendSettingsUpdate(settings.apiKey);

    // Close settings window
    if (settingsWindowExists()) {
      settingsWindow?.hide();
    }
  });

  ipcMain.on('close-settings', () => {
    if (settingsWindowExists()) {
      settingsWindow?.close();
    }
  });
}
